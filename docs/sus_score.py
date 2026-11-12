"""Υπολογισμός σκορ System Usability Scale (SUS) από CSV.

Το CSV έχει μία γραμμή ανά συμμετέχοντα και στήλες q1..q10 με τιμές 1-5
(1 = Διαφωνώ απόλυτα, 5 = Συμφωνώ απόλυτα). Παράδειγμα:

    participant,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10
    P01,4,2,5,1,4,2,5,1,4,2

Χρήση:  python docs/sus_score.py apantiseis.csv
"""

import csv
import statistics
import sys


def sus(row: dict) -> float:
    total = 0
    for i in range(1, 11):
        v = int(row[f"q{i}"])
        if not 1 <= v <= 5:
            raise ValueError(f"q{i}={v}: οι τιμές πρέπει να είναι 1-5")
        total += (v - 1) if i % 2 else (5 - v)  # μονές: θετικές, ζυγές: αρνητικές ερωτήσεις
    return total * 2.5


def grade(score: float) -> str:
    if score >= 80.3:
        return "A (εξαιρετική)"
    if score >= 68:
        return "B/C (πάνω από τον μέσο όρο)"
    if score >= 51:
        return "D (κάτω από τον μέσο όρο)"
    return "F (χαμηλή ευχρηστία)"


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    scores = [sus(r) for r in rows]
    for r, s in zip(rows, scores):
        print(f"{r.get('participant', '?'):>6}: {s:5.1f}")
    mean = statistics.mean(scores)
    sd = statistics.stdev(scores) if len(scores) > 1 else 0.0
    print(f"\nΣυμμετέχοντες: {len(scores)}")
    print(f"Μέσο SUS: {mean:.1f} (τυπική απόκλιση {sd:.1f}) -> {grade(mean)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
