"""AI βοηθός: τα εργαλεία ελέγχονται απευθείας (χωρίς κλήση στο Claude API)
και το endpoint με ψεύτικο client."""

import json
from types import SimpleNamespace

import pytest

from app import assistant
from conftest import DAY


@pytest.fixture()
def tools(make_user):
    user = make_user(username="eleni")
    user_row = {"id": user["id"], "username": "eleni", "email": user["email"], "role": "user"}
    proposals: list = []
    by_name = {t.name: t for t in assistant.build_tools(user_row, proposals)}
    return SimpleNamespace(user=user, by_name=by_name, proposals=proposals)


def call(tool, **kwargs):
    return json.loads(tool.call(kwargs))


def test_tool_schemas_are_valid(tools):
    for tool in tools.by_name.values():
        spec = tool.to_dict()
        assert spec["description"] and spec["input_schema"]["type"] == "object"
    assert set(tools.by_name) == {"search_beaches", "get_sunbed_availability", "get_my_bookings", "propose_booking"}


def test_search_and_availability_tools(tools, grid):
    beaches = call(tools.by_name["search_beaches"], date=DAY, sunbed_type="premium")
    assert beaches[0]["beach_id"] == grid["beach_id"] and beaches[0]["free_sunbeds"] == 4
    avail = call(tools.by_name["get_sunbed_availability"], beach_id=grid["beach_id"], date=DAY,
                 start_time="14:00", end_time="20:00")
    assert avail["free_count"] == 12
    assert avail["free_sunbeds"][0]["row"] == 1  # πιο κοντά στη θάλασσα πρώτα
    assert avail["free_sunbeds"][0]["price_for_window"] == 12.0


def test_propose_booking_does_not_book(tools, grid, client, sql):
    sid = grid["sunbeds"][0]["id"]
    result = call(tools.by_name["propose_booking"], sunbed_id=sid, date=DAY, start_time="08:00", end_time="14:00")
    assert result["proposal"]["price"] == 12.0
    assert len(tools.proposals) == 1
    assert sql("SELECT COUNT(*) AS n FROM reserves")[0]["n"] == 0  # τίποτα δεν κλείστηκε
    # Δεύτερη ίδια πρόταση δεν διπλασιάζεται
    call(tools.by_name["propose_booking"], sunbed_id=sid, date=DAY, start_time="08:00", end_time="14:00")
    assert len(tools.proposals) == 1


def test_tool_errors_are_raised_for_the_model(tools, grid):
    with pytest.raises(Exception, match="σεζόν"):
        tools.by_name["propose_booking"].call(
            {"sunbed_id": grid["sunbeds"][0]["id"], "date": "2027-12-01", "start_time": "08:00", "end_time": "14:00"}
        )
    with pytest.raises(Exception, match="no beach"):
        tools.by_name["get_sunbed_availability"].call({"beach_id": 999, "date": DAY})


def test_my_bookings_tool_only_sees_own_bookings(tools, grid, client, make_user):
    other = make_user()
    client.post("/bookings", json={"sunbed_id": grid["sunbeds"][1]["id"], "res_date": DAY, "start_time": "08:00",
                                   "end_time": "12:00"}, headers=other["headers"])
    assert call(tools.by_name["get_my_bookings"]) == []
    client.post("/bookings", json={"sunbed_id": grid["sunbeds"][2]["id"], "res_date": DAY, "start_time": "08:00",
                                   "end_time": "12:00"}, headers=tools.user["headers"])
    mine = call(tools.by_name["get_my_bookings"])
    assert len(mine) == 1 and mine[0]["window"] == "08:00-12:00"


class FakeRunner:
    def __init__(self, tools, final):
        self.tools, self.final = tools, final

    def until_done(self):
        # Προσομοίωση: το "μοντέλο" καλεί το propose_booking και απαντά.
        prop = next(t for t in self.tools if t.name == "propose_booking")
        prop.call(self.final.pop("call"))
        return SimpleNamespace(
            stop_reason="end_turn", model="claude-opus-5-5",
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text="Έτοιμο! Πάτα Επιβεβαίωση.")],
        )


def test_chat_endpoint_with_fake_client(client, grid, make_user, monkeypatch):
    user = make_user()
    captured = {}

    def tool_runner(**kwargs):
        captured.update(kwargs)
        return FakeRunner(kwargs["tools"], {"call": {"sunbed_id": grid["sunbeds"][0]["id"], "date": DAY,
                                                      "start_time": "08:00", "end_time": "20:00"}})

    fake = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(tool_runner=tool_runner)))
    monkeypatch.setattr(assistant, "get_client", lambda: fake)
    r = client.post(
        "/assistant/chat",
        json={"messages": [{"role": "assistant", "content": "Γεια!"}, {"role": "user", "content": "Κλείσε μου VIP"}]},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] == "Έτοιμο! Πάτα Επιβεβαίωση."
    assert body["proposals"][0]["price"] == 20.0
    # Το αρχικό μήνυμα καλωσορίσματος του assistant αφαιρείται
    assert captured["messages"][0]["role"] == "user"
    assert captured["model"] == "claude-opus-5-5" and captured["fallbacks"] == "default"
    assert user["username"] in captured["system"][1]["text"]


def test_chat_without_credentials_returns_503(client, make_user, monkeypatch):
    def broken(**_):
        raise TypeError("Could not resolve authentication method.")

    fake = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(tool_runner=broken)))
    monkeypatch.setattr(assistant, "get_client", lambda: fake)
    r = client.post("/assistant/chat", json={"messages": [{"role": "user", "content": "Γεια"}]},
                    headers=make_user()["headers"])
    assert r.status_code == 503
