#!/usr/bin/env python3
"""Build public/deck.pdf, the six-to-seven page Witness deck.

Every number and hash here is one that is recorded on Mezo testnet and in the
README. Edit this file, not the PDF, when the code changes.

    python3 scripts/build-deck.py
"""
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "deck.pdf"
FONTS = Path("/usr/share/fonts/truetype/liberation")

for name, file in [
    ("Serif", "LiberationSerif-Regular.ttf"),
    ("Sans", "LiberationSans-Regular.ttf"),
    ("SansBold", "LiberationSans-Bold.ttf"),
    ("Mono", "LiberationMono-Regular.ttf"),
]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))

W, H = 960, 540
X = 55
INNER = W - 2 * X
BG = HexColor("#151517")
CARD = HexColor("#202024")
INK = HexColor("#ededed")
MUTED = HexColor("#a1a1a1")
DIM = HexColor("#6e6e73")

EXPLORER_TX = "explorer.test.mezo.org/tx/"
TROVE_VAULT = "0xd180dd35522d1297b3cbaa5046b34850ae55569d"
POOL_VAULT = "0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8"

slides = []


def slide(fn):
    slides.append(fn)
    return fn


def frame(c, label, footer, title=None, title_size=30):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(DIM)
    c.setFont("Sans", 8.5)
    c.drawString(X, H - 50, label.upper())
    n = slides.index(current[0]) + 1
    c.setFont("Sans", 7.5)
    c.drawString(X - 2, 24, "Witness  ·  Mezo testnet")
    c.drawRightString(W - X, 24, f"{footer}   {n} / {len(slides)}")
    if title:
        c.setFillColor(INK)
        c.setFont("Serif", title_size)
        y = H - 92
        for line in title.split("\n"):
            c.drawString(X, y, line)
            y -= title_size * 1.15
        return y
    return H - 92


def card(c, x, y, w, h, title, body=None, mono=None):
    c.setFillColor(CARD)
    c.rect(x, y, w, h, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("SansBold", 12)
    c.drawString(x + 20, y + h - 24, title)
    if body:
        c.setFillColor(MUTED)
        c.setFont("Sans", 10)
        c.drawString(x + 20, y + h - 44, body)
    if mono:
        c.setFillColor(DIM)
        c.setFont("Mono", 7.2)
        c.drawString(x + 20, y + h - 62, mono)


current = [None]


@slide
def cover(c):
    frame(c, "Witness", "Cover")
    c.setFillColor(INK)
    c.setFont("Serif", 50)
    c.drawString(X, H - 200, "Nothing leaves")
    c.drawString(X, H - 258, "without your passkey.")
    c.setFillColor(MUTED)
    c.setFont("Sans", 14)
    c.drawString(X, H - 305, "Your Mezo trove and MUSD. Software can ask.")
    c.drawString(X, H - 325, "Only the bound passkey spends.")
    c.setFillColor(DIM)
    c.setFont("Sans", 11)
    c.drawString(X, H - 380, "witness-agent.vercel.app")


@slide
def product(c):
    frame(c, "What it is", "Product", "Six actions. One passkey each.")
    items = [
        ("Transfer", "MUSD to the address in the signature."),
        ("Open trove", "BTC from the vault into a Mezo trove. MUSD borrowed into it."),
        ("Pool deposit", "MUSD into the Mezo Stability Pool."),
        ("Add collateral", "More BTC into the trove. Raises the ratio. No fee."),
        ("Pool withdraw", "The position comes back to the vault."),
        ("Repay", "MUSD from the vault burned against the debt. No fee."),
    ]
    gap = 12
    w = (INNER - gap) / 2
    h = 70
    top = H - 150
    for i, (t, b) in enumerate(items):
        col, row = i % 2, i // 2
        card(c, X + col * (w + gap), top - (row + 1) * h - row * gap, w, h, t, b)
    c.setFillColor(MUTED)
    c.setFont("Sans", 10)
    c.drawString(X, 62, "A 0.10% fee is taken from transfers, pool deposits and withdrawals, and borrowed MUSD. Capped at 1% on chain.")


@slide
def rules(c):
    frame(c, "How a spend is refused", "Rules", "Four checks, then the action.")
    items = [
        ("01  One key", "A second passkey does not match, and it is refused."),
        ("02  One caller", "Only the allowlisted relayer may submit."),
        ("03  Exact action", "Chain, vault, amounts, and destination are in the signature."),
        ("04  One use", "The same signature cannot be replayed."),
    ]
    gap = 12
    w = (INNER - gap) / 2
    h = 96
    top = H - 160
    for i, (t, b) in enumerate(items):
        col, row = i % 2, i // 2
        card(c, X + col * (w + gap), top - (row + 1) * h - row * gap, w, h, t, b)
    c.setFillColor(MUTED)
    c.setFont("Sans", 10)
    c.drawString(X, 70, "Every path runs the same four checks: transfers, the Stability Pool, and the trove.")


@slide
def borrow(c):
    frame(c, "Mezo Borrow, 11 Nov 2026", "Trove", "A trove the passkey guards.")
    rows = [
        (
            "Open trove",
            "0.043 BTC collateral, 1,800 MUSD borrowed into the vault through BorrowerOperations",
            "0xf941fe81b3559cd1722f529c235c9a7d31dbc0b8d25b349101bc2ab6ac3ff733",
        ),
        (
            "Add collateral",
            "+0.005 BTC. Collateral ratio 176%. Liquidation is below 110%",
            "0xa54c300e9aa7146a3448b3342fdf8fd2e1fe538978869a350791d3e09997102b",
        ),
        (
            "Repay",
            "1 MUSD burned from the vault. Debt 2,001.8 to 2,000.8 MUSD",
            "0x23e3237203c332954ece4098a7ff1c46cd61355805390873cd5fa341c1d4c21e",
        ),
    ]
    h = 78
    gap = 10
    y = H - 140
    for t, b, tx in rows:
        y -= h
        card(c, X, y, INNER, h, t, b, tx)
        y -= gap
    c.setFillColor(MUTED)
    c.setFont("Sans", 10)
    c.drawString(
        X, 62, "The agent asked for twice the approved repay, unsigned. Refused: OverLimit. Nothing moved."
    )
    c.setFillColor(DIM)
    c.setFont("Mono", 7.5)
    c.drawString(X, 46, f"Trove vault {TROVE_VAULT}. Admin locked.")


@slide
def pool(c):
    frame(c, "Shown on Mezo, 6 Nov 2026", "On chain", "The pool round trip landed.")
    rows = [
        (
            "Deposit",
            "1 MUSD into the Stability Pool",
            "0x66f8a5aec0e25ca2865d317fad4a59f04bae79d6c1fd6fbe0ac64d58a24070a2",
        ),
        (
            "Transfer",
            "1 MUSD. Intent 6 consumed",
            "0xdefbe4c371f86f039a466c6f527d0c1129fe5736867fe46e00909a8e13e1c77c",
        ),
        (
            "Withdraw",
            "The pool returned the deposit. Intent 8 consumed",
            "0xd6b0ab45091b7836de162816e9565a6c066db6f41bbd9bda097bca515be9e53f",
        ),
    ]
    h = 78
    gap = 10
    y = H - 140
    for t, b, tx in rows:
        y -= h
        card(c, X, y, INNER, h, t, b, tx)
        y -= gap
    c.setFillColor(MUTED)
    c.setFont("Sans", 10)
    c.drawString(
        X, 62, "An amount above the ceiling was refused. Nothing moved. The vault now holds 98.998 MUSD."
    )


@slide
def changed(c):
    y = frame(
        c,
        "What changed",
        "Since Wave 1",
        "The first safe did not check the key.\nThis one does.",
    )
    lines = [
        "One passkey, enrolled on witness-agent.vercel.app. A different key is refused.",
        "Only the allowlisted executor can submit a signed action.",
        "Opens, tops up, and repays a Mezo trove through BorrowerOperations.",
        "Deposit and withdraw against the Mezo Stability Pool.",
        "A 0.10% fee is taken from the signed amount. Admin is locked.",
        "66 Foundry tests with real P-256 signatures, green in CI.",
        "Source matches the explorer. That is a source match, not an audit.",
    ]
    y -= 30
    for line in lines:
        c.setFillColor(DIM)
        c.rect(X, y + 3, 4, 4, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont("Sans", 12)
        c.drawString(X + 18, y, line)
        y -= 32


@slide
def open_it(c):
    frame(c, "Open it", "Open", "The recorded vaults stay as they are.")
    rows = [
        ("Site", "https://witness-agent.vercel.app"),
        ("Vault and trove", "https://witness-agent.vercel.app/app"),
        ("Contracts", "https://witness-agent.vercel.app/security"),
        ("Code", "https://github.com/thesithunyein/witness"),
    ]
    y = H - 175
    for k, v in rows:
        c.setFillColor(DIM)
        c.setFont("Sans", 11)
        c.drawString(X, y, k)
        c.setFillColor(INK)
        c.setFont("Sans", 12)
        c.drawString(X + 140, y, v)
        y -= 34
    c.setFillColor(MUTED)
    c.setFont("Sans", 11)
    c.drawString(X, y - 20, "A different passkey can open its own vault from the page.")
    c.drawString(X, y - 38, "That vault does not touch the recorded ones.")
    c.setFillColor(DIM)
    c.setFont("Mono", 7.5)
    c.drawString(X, 62, f"Mezo testnet, chain 31611. Trove vault {TROVE_VAULT}.")
    c.drawString(X, 50, f"Pool vault {POOL_VAULT}.")


def main():
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("Witness")
    c.setAuthor("Sithu Nyein")
    c.setSubject("Passkey approvals for a Mezo trove and MUSD")
    for fn in slides:
        current[0] = fn
        fn(c)
        c.showPage()
    c.save()
    print(f"wrote {OUT.relative_to(ROOT)} ({len(slides)} pages)")


if __name__ == "__main__":
    main()
