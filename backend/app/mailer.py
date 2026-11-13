"""Αποστολή email για τις κρατήσεις (επιβεβαίωση, αλλαγή ώρας, ακύρωση).

* Με ρυθμισμένο SMTP (π.χ. Gmail) το email φεύγει κανονικά.
* Χωρίς SMTP_HOST αποθηκεύεται ως αρχείο .eml στον φάκελο `outbox/`
  (ανοίγει με διπλό κλικ στο Outlook / Thunderbird) - χρήσιμο για δοκιμές.

Τα email στέλνονται στο παρασκήνιο (BackgroundTasks του FastAPI), οπότε η
κράτηση δεν καθυστερεί και ένα πρόβλημα στο email ΔΕΝ ακυρώνει την κράτηση.
"""

import html
import io
import logging
import smtplib
import ssl
from datetime import date, datetime
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path

import qrcode
from qrcode.image.pure import PyPNGImage

from .config import settings

log = logging.getLogger("smartbeach.mail")

WEEKDAYS = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"]
MONTHS = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου", "Ιουλίου",
          "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"]

SUBJECTS = {
    "created": "Επιβεβαίωση κράτησης",
    "updated": "Αλλαγή ώρας κράτησης",
    "cancelled": "Ακύρωση κράτησης",
    "resend": "Η κράτησή σου",
    "shared": "Κράτηση ξαπλώστρας",
}
INTROS = {
    "created": "Η κράτησή σου ολοκληρώθηκε! Δείξε τον κωδικό QR στην είσοδο.",
    "updated": "Οι ώρες της κράτησής σου άλλαξαν. Ο κωδικός QR παραμένει ο ίδιος.",
    "cancelled": "Η κράτησή σου ακυρώθηκε. Ελπίζουμε να σε δούμε σύντομα!",
    "resend": "Αυτά είναι τα στοιχεία της κράτησής σου. Δείξε τον κωδικό QR στην είσοδο.",
    "shared": "Σου στάλθηκε μια κράτηση ξαπλώστρας από το SmartBeach. Δείξε τον κωδικό QR στην είσοδο.",
}


def long_date(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


def qr_png(code: str) -> bytes:
    img = qrcode.make(code, image_factory=PyPNGImage, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue()


def build_booking_email(booking: dict, kind: str, to: str | None = None) -> EmailMessage:
    """Φτιάχνει το email (κείμενο + HTML με ενσωματωμένο QR).
    `to`: άλλος παραλήπτης (π.χ. φίλος) αντί για τον κάτοχο της κράτησης."""
    b = booking
    when = long_date(b["res_date"])
    seat = f"Σειρά {b['grid_x']}, θέση {b['grid_y']} ({'VIP' if b['type'] == 'premium' else 'κανονική'})"
    price = f"{b['price']:.2f} €".replace(".", ",")
    code = b.get("checkin_code") or ""
    pretty_code = " ".join(code[i : i + 4] for i in range(0, len(code), 4))
    directions = f"https://www.google.com/maps/dir/?api=1&destination={b['beach_ltd']},{b['beach_lgd']}"
    show_qr = kind != "cancelled" and bool(code)

    msg = EmailMessage()
    msg["Subject"] = f"{SUBJECTS[kind]} – {b['beach_name']}, {when}"
    msg["From"] = settings.mail_from
    msg["To"] = to or b["email"]
    greeting = "Γεια σου," if kind == "shared" else f"Γεια σου {b['username']},"

    rows = [
        ("Κατάστημα", b["beach_name"]),
        ("Ημερομηνία", when),
        ("Ώρες", f"{b['start_time']} – {b['end_time']}"),
        ("Θέση", seat),
        ("Κόστος", price),
        ("Ωράριο καταστήματος", f"{b['open_time']} – {b['close_time']}"),
    ]
    if show_qr:
        rows.append(("Κωδικός εισόδου", pretty_code))

    text = "\n".join(
        [greeting, "", INTROS[kind], ""]
        + [f"{k}: {v}" for k, v in rows]
        + ["", f"Οδηγίες: {directions}", "", "SmartBeach"]
    )
    msg.set_content(text)

    qr_cid = make_msgid(domain="smartbeach.local")
    table = "".join(
        f'<tr><td style="padding:6px 12px 6px 0;color:#62615d">{html.escape(k)}</td>'
        f'<td style="padding:6px 0;font-weight:600;color:#1c1c1a">{html.escape(v)}</td></tr>'
        for k, v in rows
    )
    qr_html = (
        f'<div style="text-align:center;margin:20px 0"><img src="cid:{qr_cid[1:-1]}" width="200" height="200" '
        f'alt="QR {html.escape(pretty_code)}" style="border:1px solid #e4e2da;border-radius:12px;padding:8px"/>'
        f'<div style="font-size:20px;font-weight:700;letter-spacing:2px;margin-top:8px">{html.escape(pretty_code)}</div></div>'
        if show_qr
        else ""
    )
    color = "#c62828" if kind == "cancelled" else "#007c80"
    body = f"""<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="background:{color};color:#fff;border-radius:14px 14px 0 0;padding:18px 22px">
    <div style="font-size:22px;font-weight:800">SmartBeach</div>
    <div style="font-size:15px;opacity:.9">{html.escape(SUBJECTS[kind])}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 14px 14px;padding:22px;border:1px solid #e4e2da;border-top:0">
    <p style="font-size:16px;margin:0 0 6px">{html.escape(greeting)}</p>
    <p style="font-size:15px;color:#3c3b38;margin:0 0 14px">{html.escape(INTROS[kind])}</p>
    <table style="font-size:15px;border-collapse:collapse">{table}</table>
    {qr_html}
    <p style="margin:18px 0 0"><a href="{html.escape(directions)}"
       style="background:#007c80;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">
       Οδηγίες στον χάρτη</a></p>
  </div>
</div></body></html>"""
    msg.add_alternative(body, subtype="html")
    if show_qr:
        msg.get_payload()[1].add_related(qr_png(code), maintype="image", subtype="png", cid=qr_cid)
    return msg


def page(heading: str, color: str, inner_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="background:{color};color:#fff;border-radius:14px 14px 0 0;padding:18px 22px">
    <div style="font-size:22px;font-weight:800">SmartBeach</div>
    <div style="font-size:15px;opacity:.9">{html.escape(heading)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 14px 14px;padding:22px;border:1px solid #e4e2da;border-top:0">
    {inner_html}
  </div>
</div></body></html>"""


def build_simple_email(to: str, subject: str, heading: str, paragraphs: list[str], color: str = "#007c80") -> EmailMessage:
    """Απλό email ειδοποίησης (π.χ. για αιτήσεις συνεργατών)."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg.set_content("\n\n".join(paragraphs + ["SmartBeach"]))
    inner = "".join(
        f'<p style="font-size:15px;color:#3c3b38;margin:0 0 12px;white-space:pre-line">{html.escape(p)}</p>' for p in paragraphs
    )
    msg.add_alternative(page(heading, color, inner), subtype="html")
    return msg


def send_simple_email(to: str, subject: str, heading: str, paragraphs: list[str], color: str = "#007c80") -> None:
    """Ασφαλής αποστολή απλού email (για BackgroundTasks)."""
    if not settings.mail_enabled or not to:
        return
    try:
        where = deliver(build_simple_email(to, subject, heading, paragraphs, color))
        log.info("Email '%s' -> %s", subject, where)
    except Exception:  # noqa: BLE001
        log.exception("Αποτυχία αποστολής email '%s'", subject)


CODE_TEXT = {
    "verify_email": ("Επιβεβαίωση email", "Γράψε αυτόν τον κωδικό στην εφαρμογή για να ενεργοποιηθεί ο λογαριασμός σου."),
    "login": ("Κωδικός σύνδεσης", "Κάποιος (ελπίζουμε εσύ!) συνδέεται στον λογαριασμό σου. Γράψε αυτόν τον κωδικό στην εφαρμογή."),
}


def send_code_email(to: str, username: str, code: str, purpose: str) -> None:
    """Κωδικός μίας χρήσης. Χωρίς SMTP εμφανίζεται ΚΑΙ στο παράθυρο του server,
    ώστε η εφαρμογή να δουλεύει και χωρίς ρυθμισμένο email (π.χ. σε παρουσίαση)."""
    heading, text = CODE_TEXT[purpose]
    if not settings.smtp_host:
        print(
            "\n" + "=" * 56
            + f"\n  {heading.upper()} για {to}\n  ΚΩΔΙΚΟΣ: {code}\n"
            + "  (δεν έχει ρυθμιστεί email - δες 3-RYTHMISI-EMAIL.bat)\n" + "=" * 56,
            flush=True,
        )
    if not settings.mail_enabled:
        return
    msg = EmailMessage()
    msg["Subject"] = f"{code} - {heading} SmartBeach"
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg.set_content(f"Γεια σου {username},\n\n{text}\n\nΚωδικός: {code}\n\nΙσχύει για 10 λεπτά. Αν δεν το ζήτησες εσύ, αγνόησέ το.")
    inner = (
        f'<p style="font-size:16px;margin:0 0 6px">Γεια σου {html.escape(username)},</p>'
        f'<p style="font-size:15px;color:#3c3b38;margin:0 0 16px">{html.escape(text)}</p>'
        f'<div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;background:#f6f4ef;'
        f'border-radius:12px;padding:16px;color:#1c1c1a">{code}</div>'
        '<p style="font-size:13px;color:#62615d;margin:14px 0 0">Ισχύει για 10 λεπτά. Αν δεν το ζήτησες εσύ, αγνόησέ το.</p>'
    )
    msg.add_alternative(page(heading, "#007c80", inner), subtype="html")
    try:
        where = deliver(msg)
        log.info("Κωδικός '%s' -> %s", purpose, where)
    except Exception:  # noqa: BLE001
        log.exception("Αποτυχία αποστολής κωδικού σε %s", to)


def deliver(msg: EmailMessage) -> str:
    """Στέλνει με SMTP ή γράφει στο outbox. Επιστρέφει πού κατέληξε."""
    if settings.smtp_host:
        context = ssl.create_default_context()
        if settings.smtp_ssl:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        with server:
            if not settings.smtp_ssl:
                server.starttls(context=context)
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return f"smtp:{msg['To']}"
    folder = Path(settings.mail_outbox)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{datetime.now():%Y%m%d-%H%M%S-%f}.eml"
    path.write_bytes(bytes(msg))
    return str(path)


def send_booking_email(booking: dict, kind: str) -> None:
    """Ασφαλής αποστολή: τυχόν σφάλμα καταγράφεται, δεν "σπάει" την κράτηση."""
    if not settings.mail_enabled:
        return
    try:
        where = deliver(build_booking_email(booking, kind))
        log.info("Email '%s' για την κράτηση %s -> %s", kind, booking.get("booking_id"), where)
    except Exception:  # noqa: BLE001
        log.exception("Αποτυχία αποστολής email για την κράτηση %s", booking.get("booking_id"))
