"""
สร้างคู่มือการใช้งาน ระบบกิจการนักศึกษา
คณะมนุษยศาสตร์และสังคมศาสตร์ มหาวิทยาลัยสวนดุสิต
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable
import os, urllib.request, io

# ── Load Sarabun font ──────────────────────────────────────────────────────────
FONT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_REG  = os.path.join(FONT_DIR, "Sarabun-Regular.ttf")
FONT_BOLD = os.path.join(FONT_DIR, "Sarabun-Bold.ttf")

def download_font(url, path):
    if not os.path.exists(path):
        print(f"Downloading {os.path.basename(path)}…")
        urllib.request.urlretrieve(url, path)

BASE = "https://github.com/google/fonts/raw/main/ofl/sarabun/"
download_font(BASE + "Sarabun-Regular.ttf", FONT_REG)
download_font(BASE + "Sarabun-Bold.ttf",    FONT_BOLD)

pdfmetrics.registerFont(TTFont("Sarabun",     FONT_REG))
pdfmetrics.registerFont(TTFont("Sarabun-Bold", FONT_BOLD))

# ── Colors ─────────────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#0d1f5c")
NAVY2  = colors.HexColor("#1a3080")
GOLD   = colors.HexColor("#c8960c")
GOLD_L = colors.HexColor("#f0c040")
CREAM  = colors.HexColor("#f7f5f0")
WHITE  = colors.white
GREY   = colors.HexColor("#4b4030")
LGREY  = colors.HexColor("#e2ddd0")

# ── Styles ─────────────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    base = dict(fontName="Sarabun", leading=18)

    s["h1"] = ParagraphStyle("h1",
        fontName="Sarabun-Bold", fontSize=20, leading=26,
        textColor=NAVY, spaceAfter=8, spaceBefore=20)

    s["h2"] = ParagraphStyle("h2",
        fontName="Sarabun-Bold", fontSize=14, leading=20,
        textColor=NAVY, spaceAfter=6, spaceBefore=14,
        borderPad=4)

    s["h3"] = ParagraphStyle("h3",
        fontName="Sarabun-Bold", fontSize=11, leading=16,
        textColor=GOLD, spaceAfter=4, spaceBefore=10)

    s["body"] = ParagraphStyle("body",
        fontName="Sarabun", fontSize=11, leading=18,
        textColor=GREY, spaceAfter=6)

    s["bullet"] = ParagraphStyle("bullet",
        fontName="Sarabun", fontSize=11, leading=18,
        textColor=GREY, leftIndent=18, spaceAfter=4,
        bulletIndent=4)

    s["note"] = ParagraphStyle("note",
        fontName="Sarabun", fontSize=10, leading=16,
        textColor=colors.HexColor("#7a5200"),
        backColor=colors.HexColor("#fef3c7"),
        borderPad=6, spaceAfter=8)

    s["small"] = ParagraphStyle("small",
        fontName="Sarabun", fontSize=9, leading=14,
        textColor=colors.HexColor("#6b6050"))

    s["center"] = ParagraphStyle("center",
        fontName="Sarabun", fontSize=11, leading=18,
        alignment=1)

    s["cover_title"] = ParagraphStyle("cover_title",
        fontName="Sarabun-Bold", fontSize=28, leading=36,
        textColor=WHITE, alignment=1, spaceAfter=6)

    s["cover_sub"] = ParagraphStyle("cover_sub",
        fontName="Sarabun", fontSize=14, leading=20,
        textColor=colors.HexColor("#f0c040"), alignment=1, spaceAfter=4)

    s["cover_small"] = ParagraphStyle("cover_small",
        fontName="Sarabun", fontSize=11, leading=16,
        textColor=colors.HexColor("#c0b8a0"), alignment=1)

    return s

S = make_styles()

def hr(): return HRFlowable(width="100%", thickness=1, color=LGREY, spaceAfter=8, spaceBefore=4)
def gold_hr(): return HRFlowable(width="100%", thickness=2, color=GOLD, spaceAfter=10, spaceBefore=4)
def sp(h=6): return Spacer(1, h)
def b(txt): return f"<b>{txt}</b>"
def gold(txt): return f'<font color="#c8960c">{txt}</font>'
def navy(txt): return f'<font color="#0d1f5c">{txt}</font>'

# ── Section header ─────────────────────────────────────────────────────────────
def section_header(title, icon=""):
    tbl = Table([[Paragraph(f"{icon} {title}", S["h2"])]],
        colWidths=["100%"])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,-1), colors.HexColor("#f0ecdf")),
        ("LINEBELOW",   (0,0), (-1,-1), 2, GOLD),
        ("TOPPADDING",  (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("ROUNDEDCORNERS", [6]),
    ]))
    return tbl

def role_badge(role, color_hex, text):
    tbl = Table([[Paragraph(f"<b>{text}</b>", ParagraphStyle("rb",
        fontName="Sarabun-Bold", fontSize=10, leading=14,
        textColor=WHITE))]],
        colWidths=[3*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,-1), colors.HexColor(color_hex)),
        ("ALIGN",      (0,0),(-1,-1), "CENTER"),
        ("TOPPADDING", (0,0),(-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("ROUNDEDCORNERS", [8]),
    ]))
    return tbl

def step_table(steps):
    """steps = [(num, title, desc), ...]"""
    rows = []
    for num, title, desc in steps:
        num_p = Paragraph(f"<b>{num}</b>", ParagraphStyle("snum",
            fontName="Sarabun-Bold", fontSize=16, leading=20,
            textColor=GOLD, alignment=1))
        body_p = Paragraph(f"<b>{title}</b><br/><font size='10' color='#4b4030'>{desc}</font>", S["body"])
        rows.append([num_p, body_p])

    tbl = Table(rows, colWidths=[1.2*cm, None])
    tbl.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("LEFTPADDING",   (0,0),(0,-1),  6),
        ("RIGHTPADDING",  (0,0),(0,-1),  10),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [CREAM, WHITE]),
        ("LINEBELOW",     (0,0),(-1,-1), 0.5, LGREY),
    ]))
    return tbl

def feature_table(rows_data):
    """rows_data = [(icon, feature, desc), ...]"""
    rows = [[
        Paragraph(f"<b>ฟีเจอร์</b>", S["small"]),
        Paragraph(f"<b>รายละเอียด</b>", S["small"]),
    ]]
    for icon, feat, desc in rows_data:
        rows.append([
            Paragraph(f"{icon} <b>{feat}</b>", ParagraphStyle("ft",
                fontName="Sarabun-Bold", fontSize=10, leading=15, textColor=NAVY)),
            Paragraph(desc, S["small"]),
        ])
    tbl = Table(rows, colWidths=[5*cm, None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0),  WHITE),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, CREAM]),
        ("LINEBELOW",     (0,0),(-1,-1), 0.5, LGREY),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("GRID",          (0,0),(-1,-1), 0.3, LGREY),
    ]))
    return tbl

# ── Cover page ─────────────────────────────────────────────────────────────────
def cover_page():
    elems = []

    # Navy banner
    banner = Table([[""]], colWidths=["100%"], rowHeights=[3*cm])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,-1), NAVY),
        ("LINEBELOW",  (0,0),(-1,-1), 4, GOLD),
    ]))
    elems.append(banner)
    elems.append(sp(40))

    # Logo placeholder circle
    logo_tbl = Table([[Paragraph("🎓", ParagraphStyle("lp",
        fontName="Sarabun", fontSize=60, leading=72, alignment=1))]],
        colWidths=["100%"])
    logo_tbl.setStyle(TableStyle([
        ("ALIGN",   (0,0),(-1,-1), "CENTER"),
    ]))
    elems.append(logo_tbl)
    elems.append(sp(16))

    elems.append(Paragraph("คู่มือการใช้งาน", ParagraphStyle("ct",
        fontName="Sarabun-Bold", fontSize=26, leading=34,
        textColor=NAVY, alignment=1)))
    elems.append(sp(6))

    title_box = Table([[Paragraph("ระบบกิจการนักศึกษา", ParagraphStyle("tb",
        fontName="Sarabun-Bold", fontSize=20, leading=28,
        textColor=WHITE, alignment=1))]],
        colWidths=["100%"])
    title_box.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY),
        ("TOPPADDING",    (0,0),(-1,-1), 12),
        ("BOTTOMPADDING", (0,0),(-1,-1), 12),
    ]))
    elems.append(title_box)
    elems.append(sp(10))

    gold_line = Table([[""]], colWidths=["100%"], rowHeights=[4])
    gold_line.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1), GOLD)]))
    elems.append(gold_line)
    elems.append(sp(20))

    elems.append(Paragraph("คณะมนุษยศาสตร์และสังคมศาสตร์", S["center"]))
    elems.append(Paragraph("มหาวิทยาลัยสวนดุสิต", S["center"]))
    elems.append(sp(40))

    info = Table([
        [Paragraph("เวอร์ชัน", S["small"]),  Paragraph("2.0", S["small"])],
        [Paragraph("อัปเดตล่าสุด", S["small"]), Paragraph("มิถุนายน 2569", S["small"])],
        [Paragraph("ผู้ดูแลระบบ", S["small"]), Paragraph("ประธานกิจการนักศึกษา", S["small"])],
    ], colWidths=[4*cm, None])
    info.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,-1), CREAM),
        ("GRID",       (0,0),(-1,-1), 0.5, LGREY),
        ("TOPPADDING", (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",(0,0),(-1,-1), 10),
        ("FONTNAME",   (0,0),(0,-1),  "Sarabun-Bold"),
    ]))
    elems.append(info)
    elems.append(PageBreak())
    return elems

# ── Table of contents ──────────────────────────────────────────────────────────
def toc():
    elems = []
    elems.append(Paragraph("สารบัญ", S["h1"]))
    elems.append(gold_hr())
    elems.append(sp(4))

    chapters = [
        ("1", "ภาพรวมระบบ",                "3"),
        ("2", "การสมัครสมาชิก (Register)",  "4"),
        ("3", "การเข้าสู่ระบบ (Login)",     "5"),
        ("4", "สมาชิก — หน้าหลัก",          "6"),
        ("5", "สมาชิก — บัตรสมาชิก",        "7"),
        ("6", "สมาชิก — กิจกรรมและประวัติ", "8"),
        ("7", "คณะกรรมการ",                 "9"),
        ("8", "ประธาน / แอดมิน",            "11"),
        ("9", "คำถามที่พบบ่อย (FAQ)",        "13"),
    ]
    rows = [[
        Paragraph("<b>บทที่</b>", S["small"]),
        Paragraph("<b>หัวข้อ</b>", S["small"]),
        Paragraph("<b>หน้า</b>", S["small"]),
    ]]
    for num, title, page in chapters:
        rows.append([
            Paragraph(num, S["body"]),
            Paragraph(title, S["body"]),
            Paragraph(page, S["body"]),
        ])

    tbl = Table(rows, colWidths=[1.5*cm, None, 1.5*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0),  WHITE),
        ("FONTNAME",      (0,0),(-1,0),  "Sarabun-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, CREAM]),
        ("LINEBELOW",     (0,0),(-1,-1), 0.5, LGREY),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("ALIGN",         (0,0),(0,-1),  "CENTER"),
        ("ALIGN",         (2,0),(2,-1),  "CENTER"),
    ]))
    elems.append(tbl)
    elems.append(PageBreak())
    return elems

# ── Chapter 1: Overview ────────────────────────────────────────────────────────
def ch1():
    elems = []
    elems.append(section_header("บทที่ 1 — ภาพรวมระบบ", "📊"))
    elems.append(sp(8))
    elems.append(Paragraph(
        "ระบบกิจการนักศึกษาเป็นเว็บแอปพลิเคชันสำหรับบริหารจัดการองค์กรนักศึกษา "
        "คณะมนุษยศาสตร์และสังคมศาสตร์ มหาวิทยาลัยสวนดุสิต ครอบคลุมการลงทะเบียนสมาชิก "
        "การเข้าร่วมกิจกรรม การติดตามชั่วโมงสะสม และการบริหารงานของคณะกรรมการ", S["body"]))
    elems.append(sp(10))

    elems.append(Paragraph("สิทธิ์ผู้ใช้งาน 3 ระดับ", S["h3"]))
    roles = [
        [role_badge("admin", "#0d1f5c", "ประธาน / แอดมิน"),
         Paragraph("จัดการสมาชิก กิจกรรม ประกาศ และดู Log ทั้งหมด", S["body"])],
        [role_badge("com", "#065f46", "คณะกรรมการ"),
         Paragraph("เข้าร่วมกิจกรรม เพิ่มตำแหน่งงาน Export รายชื่อ", S["body"])],
        [role_badge("mem", "#7a5200", "สมาชิก"),
         Paragraph("ดูกิจกรรม สมัครเข้าร่วม ดูบัตรสมาชิก ติดตามชั่วโมงสะสม", S["body"])],
    ]
    tbl = Table(roles, colWidths=[4*cm, None])
    tbl.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (1,0),(1,-1),  12),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, CREAM, WHITE]),
        ("LINEBELOW",     (0,0),(-1,-1), 0.5, LGREY),
    ]))
    elems.append(tbl)
    elems.append(sp(12))

    elems.append(Paragraph("เข้าถึงระบบได้ที่:", S["h3"]))
    url_box = Table([[Paragraph(
        "<b>https://gitjha-d8454.web.app</b>",
        ParagraphStyle("url", fontName="Sarabun-Bold", fontSize=13,
                       textColor=NAVY, alignment=1))]],
        colWidths=["100%"])
    url_box.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), CREAM),
        ("LINEBELOW",     (0,0),(-1,-1), 3, GOLD),
        ("TOPPADDING",    (0,0),(-1,-1), 12),
        ("BOTTOMPADDING", (0,0),(-1,-1), 12),
    ]))
    elems.append(url_box)
    elems.append(PageBreak())
    return elems

# ── Chapter 2: Register ────────────────────────────────────────────────────────
def ch2():
    elems = []
    elems.append(section_header("บทที่ 2 — การสมัครสมาชิก", "📝"))
    elems.append(sp(8))
    elems.append(Paragraph(
        "นักศึกษาสามารถสมัครสมาชิกด้วยตนเองผ่านหน้าเว็บ "
        "โดยไม่ต้องรอให้ประธานเพิ่มให้", S["body"]))
    elems.append(sp(8))

    elems.append(Paragraph("ขั้นตอนการสมัคร", S["h3"]))
    elems.append(step_table([
        ("1", "เปิดเว็บไซต์", "ไปที่ https://gitjha-d8454.web.app"),
        ("2", "กดแท็บ 'สมัครสมาชิก'", "อยู่ด้านบนของหน้า Login"),
        ("3", "กรอกรหัสนักศึกษา", "ต้องเป็นตัวเลข 13 หลักเท่านั้น"),
        ("4", "กรอกชื่อ-นามสกุล", "ชื่อ-นามสกุลจริงตามบัตรประชาชน"),
        ("5", "เลือกหลักสูตร", "ไม่บังคับ — สามารถแก้ไขภายหลังได้"),
        ("6", "กรอกเบอร์โทร / Line ID", "ไม่บังคับ — ใช้แสดงในบัตรสมาชิก"),
        ("7", "ตั้งรหัสผ่าน", "อย่างน้อย 6 ตัวอักษร และยืนยันอีกครั้ง"),
        ("8", "กด 'สมัครสมาชิก'", "ระบบจะพาเข้าหน้าหลักโดยอัตโนมัติ"),
    ]))
    elems.append(sp(10))

    elems.append(Table([[Paragraph(
        "⚠️  รหัสนักศึกษาต้องเป็นตัวเลข 13 หลัก หากกรอกผิดจะไม่สามารถสมัครได้ "
        "และไม่สามารถเปลี่ยนรหัสนักศึกษาภายหลังได้", S["note"])]],
        colWidths=["100%"]))
    elems.append(PageBreak())
    return elems

# ── Chapter 3: Login ───────────────────────────────────────────────────────────
def ch3():
    elems = []
    elems.append(section_header("บทที่ 3 — การเข้าสู่ระบบ", "🔐"))
    elems.append(sp(8))
    elems.append(step_table([
        ("1", "เปิดเว็บไซต์", "ไปที่ https://gitjha-d8454.web.app"),
        ("2", "กรอกรหัสนักศึกษา", "รหัสนักศึกษา 13 หลักที่ใช้สมัคร"),
        ("3", "กรอกรหัสผ่าน", "รหัสผ่านที่ตั้งไว้ตอนสมัคร"),
        ("4", "กด 'เข้าสู่ระบบ'", "ระบบจะนำไปหน้าที่ตรงกับสิทธิ์ของคุณ"),
    ]))
    elems.append(sp(10))

    elems.append(Paragraph("ระบบนำไปหน้าใด?", S["h3"]))
    dest = [
        ["สิทธิ์", "หน้าที่ไป"],
        ["ประธาน / แอดมิน", "แผงประธาน (admin.html)"],
        ["คณะกรรมการ",       "แผงคณะกรรมการ (committee.html)"],
        ["สมาชิก",           "หน้าหลักสมาชิก (dashboard.html)"],
    ]
    tbl = Table(dest, colWidths=[5*cm, None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Sarabun-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, CREAM, WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, LGREY),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
    ]))
    elems.append(tbl)
    elems.append(sp(10))
    elems.append(Table([[Paragraph(
        "💡  ลืมรหัสผ่าน? ให้ติดต่อประธานกิจการนักศึกษาเพื่อให้รีเซ็ตรหัสผ่านให้", S["note"])]],
        colWidths=["100%"]))
    elems.append(PageBreak())
    return elems

# ── Chapter 4: Member Dashboard ───────────────────────────────────────────────
def ch4():
    elems = []
    elems.append(section_header("บทที่ 4 — สมาชิก: หน้าหลัก", "🏠"))
    elems.append(sp(8))
    elems.append(Paragraph(
        "เมื่อเข้าสู่ระบบสำเร็จ สมาชิกจะเห็นหน้า Dashboard ที่แสดงข้อมูลสรุปและ "
        "ทางลัดไปยังฟีเจอร์ต่าง ๆ", S["body"]))
    elems.append(sp(8))

    elems.append(feature_table([
        ("📊", "การ์ดสรุป",     "แสดงจำนวนงานที่เข้าร่วม ชั่วโมงสะสม งานที่เปิดรับ และตำแหน่ง"),
        ("⏰", "นาฬิกาสด",      "แสดงเวลาปัจจุบันแบบ real-time"),
        ("⚡", "ปุ่มลัด 4 ปุ่ม", "กิจกรรม / ชั่วโมง / ประวัติ / โปรไฟล์"),
        ("📢", "ข่าวสาร",       "ดูประกาศล่าสุดจากประธาน"),
        ("🖼️", "ป้ายประกาศ",   "รูปภาพและป้ายประกาศที่แอดมินอัปโหลด"),
        ("👤", "โปรไฟล์",       "กดปุ่มวงกลมมุมบนขวา — ดูข้อมูล อัปโหลดรูป และเปิดบัตรสมาชิก"),
    ]))
    elems.append(sp(10))

    elems.append(Paragraph("เมนูด้านล่าง (Bottom Navigation)", S["h3"]))
    nav = [
        ["ไอคอน", "เมนู", "หน้าที่"],
        ["🏠", "หน้าหลัก", "Dashboard สรุปภาพรวม"],
        ["🎯", "กิจกรรม",  "ดูและสมัครกิจกรรมที่เปิดรับ"],
        ["📋", "ประวัติ",  "ดูประวัติการเข้าร่วมทั้งหมด"],
        ["📢", "ข่าวสาร",  "ดูประกาศทั้งหมด"],
    ]
    tbl = Table(nav, colWidths=[1.5*cm, 3.5*cm, None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Sarabun-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, CREAM, WHITE, CREAM]),
        ("GRID",          (0,0),(-1,-1), 0.5, LGREY),
        ("ALIGN",         (0,0),(0,-1), "CENTER"),
        ("TOPPADDING",    (0,0),(-1,-1), 7),
        ("BOTTOMPADDING", (0,0),(-1,-1), 7),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ]))
    elems.append(tbl)
    elems.append(PageBreak())
    return elems

# ── Chapter 5: Member Card ────────────────────────────────────────────────────
def ch5():
    elems = []
    elems.append(section_header("บทที่ 5 — สมาชิก: บัตรสมาชิก", "🪪"))
    elems.append(sp(8))
    elems.append(Paragraph(
        "บัตรสมาชิกดิจิทัลแสดงข้อมูลของคุณในรูปแบบบัตรประจำตัว "
        "พร้อมโลโก้คณะและบาร์โค้ด", S["body"]))
    elems.append(sp(8))

    elems.append(Paragraph("วิธีเปิดบัตรสมาชิก", S["h3"]))
    elems.append(step_table([
        ("1", "กดปุ่มวงกลม (ชื่อย่อหรือรูปโปรไฟล์)", "มุมบนขวาของหน้าจอ"),
        ("2", "กด 'บัตรสมาชิก'", "ปุ่มอยู่ด้านล่างของหน้าต่างโปรไฟล์"),
        ("3", "บัตรจะขึ้นมา", "แสดงชื่อ รหัส หลักสูตร ตำแหน่ง ชั่วโมงสะสม"),
    ]))
    elems.append(sp(10))

    elems.append(Paragraph("การอัปโหลดรูปโปรไฟล์", S["h3"]))
    elems.append(step_table([
        ("1", "เปิดโปรไฟล์หรือบัตรสมาชิก", "กดปุ่มวงกลมมุมบนขวา"),
        ("2", "กดปุ่ม 📷", "ปุ่มเล็กๆ บริเวณรูปโปรไฟล์"),
        ("3", "เลือกรูปจากเครื่อง", "รองรับ JPG, PNG — ระบบ compress อัตโนมัติ"),
        ("4", "รูปจะอัปเดตทันที", "ทั้งบัตรสมาชิกและปุ่ม Avatar บน Topbar"),
    ]))
    elems.append(sp(8))

    elems.append(Table([[Paragraph(
        "💡  รูปโปรไฟล์จะแสดงในบัตรสมาชิกและปุ่มด้านบน — แนะนำใช้รูปหน้าตรงพื้นหลังเรียบ", S["note"])]],
        colWidths=["100%"]))
    elems.append(PageBreak())
    return elems

# ── Chapter 6: Events & History ───────────────────────────────────────────────
def ch6():
    elems = []
    elems.append(section_header("บทที่ 6 — สมาชิก: กิจกรรมและประวัติ", "🎯"))
    elems.append(sp(8))

    elems.append(Paragraph("การสมัครเข้าร่วมกิจกรรม", S["h3"]))
    elems.append(step_table([
        ("1", "ไปที่เมนู 'กิจกรรม'", "กดไอคอน 🎯 ด้านล่าง"),
        ("2", "เลือกกิจกรรมที่ต้องการ", "กิจกรรมที่เปิดรับจะมีปุ่ม '+ เข้าร่วม'"),
        ("3", "เลือกตำแหน่ง (ถ้ามี)", "บางกิจกรรมมีตำแหน่งงานให้เลือก"),
        ("4", "กด 'ยืนยันเข้าร่วม'", "ระบบจะส่งคำขอไปให้ประธานอนุมัติ"),
        ("5", "รอการอนุมัติ", "สถานะจะเปลี่ยนเป็น ✅ เมื่ออนุมัติแล้ว"),
    ]))
    elems.append(sp(10))

    elems.append(Paragraph("สถานะคำขอ", S["h3"]))
    status = [
        ["สถานะ", "ความหมาย"],
        ["⏳ รออนุมัติ",    "ส่งคำขอแล้ว รอประธานตรวจสอบ"],
        ["✅ เข้าร่วมแล้ว", "อนุมัติแล้ว ชั่วโมงจะถูกบันทึก"],
        ["✗ ไม่อนุมัติ",   "ประธานไม่อนุมัติ สามารถสมัครใหม่ได้"],
    ]
    tbl = Table(status, colWidths=[5*cm, None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Sarabun-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, CREAM, WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, LGREY),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
    ]))
    elems.append(tbl)
    elems.append(sp(10))

    elems.append(Paragraph("การดูชั่วโมงสะสม", S["h3"]))
    elems.append(Paragraph(
        "กดที่การ์ด '⏱️ ชั่วโมงสะสม' หรือไปที่เมนู 'ประวัติ' "
        "เพื่อดูรายละเอียดชั่วโมงสะสมแต่ละกิจกรรม", S["body"]))
    elems.append(sp(6))
    elems.append(Paragraph(
        "กด 'ยกเลิก' ในรายการ ⏳ รออนุมัติ เพื่อยกเลิกคำขอก่อนที่ประธานจะอนุมัติ", S["body"]))
    elems.append(PageBreak())
    return elems

# ── Chapter 7: Committee ──────────────────────────────────────────────────────
def ch7():
    elems = []
    elems.append(section_header("บทที่ 7 — คณะกรรมการ", "🏅"))
    elems.append(sp(8))
    elems.append(Paragraph(
        "คณะกรรมการมีสิทธิ์มากกว่าสมาชิกทั่วไป สามารถเพิ่มตำแหน่งงานในกิจกรรม "
        "และ Export รายชื่อผู้เข้าร่วมได้", S["body"]))
    elems.append(sp(8))

    elems.append(Paragraph("เมนูด้านล่าง", S["h3"]))
    nav = [
        ["ไอคอน", "เมนู", "หน้าที่"],
        ["📊", "ภาพรวม", "สรุปสถิติทีม"],
        ["👥", "ทีมฉัน", "ดูรายชื่อสมาชิกในหลักสูตรเดียวกัน"],
        ["🎯", "กิจกรรม", "ดู / สมัคร / เพิ่มตำแหน่ง / Export"],
        ["🖼️", "ป้ายประกาศ", "ดูป้ายประกาศจากประธาน"],
    ]
    tbl = Table(nav, colWidths=[1.5*cm, 3.5*cm, None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), colors.HexColor("#065f46")),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Sarabun-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, CREAM, WHITE, CREAM]),
        ("GRID",          (0,0),(-1,-1), 0.5, LGREY),
        ("ALIGN",         (0,0),(0,-1), "CENTER"),
        ("TOPPADDING",    (0,0),(-1,-1), 7),
        ("BOTTOMPADDING", (0,0),(-1,-1), 7),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ]))
    elems.append(tbl)
    elems.append(sp(10))

    elems.append(Paragraph("การเพิ่มตำแหน่งงานในกิจกรรม", S["h3"]))
    elems.append(step_table([
        ("1", "ไปที่เมนู 'กิจกรรม'", ""),
        ("2", "กดปุ่ม '📌 เพิ่มตำแหน่ง'", "ปรากฏในการ์ดกิจกรรมที่ยังเปิดรับ"),
        ("3", "กรอกชื่อตำแหน่ง", "เช่น ช่างภาพ พิธีกร ลงทะเบียน"),
        ("4", "ระบุจำนวนที่รับ", "กรอกจำนวนคนที่ต้องการในตำแหน่งนั้น"),
        ("5", "กด 'เพิ่มตำแหน่ง'", "ตำแหน่งจะถูกบันทึกในกิจกรรม"),
    ]))
    elems.append(sp(8))

    elems.append(Table([[Paragraph(
        "⚠️  คณะกรรมการ เพิ่มตำแหน่งได้ แต่ ลบหรือแก้ไขตำแหน่งไม่ได้ "
        "— ต้องให้ประธานดำเนินการ", S["note"])]],
        colWidths=["100%"]))
    elems.append(sp(10))

    elems.append(Paragraph("การ Export รายชื่อผู้เข้าร่วม", S["h3"]))
    elems.append(step_table([
        ("1", "ไปที่เมนู 'กิจกรรม'", ""),
        ("2", "กดปุ่ม '📥 Export'", "ในการ์ดกิจกรรมที่ต้องการ"),
        ("3", "ไฟล์ .csv จะถูกดาวน์โหลด", "เปิดด้วย Excel หรือ Google Sheets ได้เลย"),
    ]))
    elems.append(sp(6))
    elems.append(Paragraph(
        "ไฟล์ Export มีคอลัมน์: ลำดับ ชื่อ-นามสกุล รหัสนักศึกษา หลักสูตร "
        "ตำแหน่งงาน ชั่วโมง สถานะ อนุมัติโดย", S["body"]))
    elems.append(PageBreak())
    return elems

# ── Chapter 8: Admin ──────────────────────────────────────────────────────────
def ch8():
    elems = []
    elems.append(section_header("บทที่ 8 — ประธาน / แอดมิน", "⭐"))
    elems.append(sp(8))

    elems.append(Paragraph("เมนูด้านล่าง", S["h3"]))
    nav = [
        ["ไอคอน", "เมนู", "หน้าที่"],
        ["📊", "ภาพรวม", "สถิติรวม กิจกรรมล่าสุด Leaderboard"],
        ["👥", "สมาชิก",  "เพิ่ม / แก้ไข / ลบสมาชิก"],
        ["🎯", "กิจกรรม", "สร้าง / แก้ไข / ปิด / อนุมัติผู้เข้าร่วม"],
        ["🖼️", "ป้ายประกาศ", "เพิ่ม / แก้ไข / ลบป้ายและประกาศ"],
        ["📝", "Log",     "ดูประวัติการกระทำทั้งหมด / เคลียร์ Log"],
    ]
    tbl = Table(nav, colWidths=[1.5*cm, 3.5*cm, None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Sarabun-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, CREAM, WHITE, CREAM, WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, LGREY),
        ("ALIGN",         (0,0),(0,-1), "CENTER"),
        ("TOPPADDING",    (0,0),(-1,-1), 7),
        ("BOTTOMPADDING", (0,0),(-1,-1), 7),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ]))
    elems.append(tbl)
    elems.append(sp(10))

    elems.append(Paragraph("การจัดการสมาชิก", S["h3"]))
    elems.append(feature_table([
        ("➕", "เพิ่มสมาชิก",   "กด '+ เพิ่มสมาชิก' — กรอกข้อมูลและรหัสผ่านเริ่มต้น ระบบจะสร้าง account ให้"),
        ("✏️", "แก้ไขสมาชิก",  "กดปุ่มแก้ไข (✏️) หน้าชื่อสมาชิก — แก้ไขได้ทุกฟิลด์ยกเว้นรหัสนักศึกษา"),
        ("🗑️", "ลบสมาชิก",    "กดปุ่มลบ — ระบบจะถามยืนยันก่อน"),
        ("🔍", "ค้นหา/กรอง",   "พิมพ์ชื่อหรือรหัสในช่องค้นหา / กรองตามหลักสูตรหรือสิทธิ์"),
    ]))
    elems.append(sp(10))

    elems.append(Paragraph("การจัดการกิจกรรม", S["h3"]))
    elems.append(feature_table([
        ("🆕", "สร้างกิจกรรม",   "กด '+ สร้างกิจกรรม' — ใส่ชื่อ วันที่ ชั่วโมง สถานที่ และตำแหน่งงาน"),
        ("✏️", "แก้ไขกิจกรรม",  "กดปุ่มแก้ไข — แก้ไขได้ทุกฟิลด์รวมถึงตำแหน่งงาน"),
        ("🔒", "ปิดรับสมัคร",   "กดปุ่มปิด — กิจกรรมจะเปลี่ยนสถานะเป็น closed"),
        ("✅", "อนุมัติผู้เข้าร่วม", "กดชื่อกิจกรรม — ดูรายชื่อและกด อนุมัติ / ปฏิเสธ รายบุคคล"),
        ("📥", "Export รายชื่อ", "กดปุ่ม Export ในหน้ารายชื่อผู้เข้าร่วม"),
    ]))
    elems.append(sp(10))

    elems.append(Paragraph("ระบบ Log", S["h3"]))
    elems.append(Paragraph(
        "ไปที่เมนู 📝 Log เพื่อดูประวัติการกระทำทั้งหมดในระบบ "
        "สามารถกด '🗑️ เคลียร์ Log' เพื่อลบ Log ทั้งหมดเมื่อต้องการประหยัดพื้นที่", S["body"]))
    elems.append(PageBreak())
    return elems

# ── Chapter 9: FAQ ────────────────────────────────────────────────────────────
def ch9():
    elems = []
    elems.append(section_header("บทที่ 9 — คำถามที่พบบ่อย (FAQ)", "❓"))
    elems.append(sp(8))

    faqs = [
        ("ลืมรหัสผ่านทำอย่างไร?",
         "ให้ติดต่อประธานกิจการนักศึกษาเพื่อให้รีเซ็ตรหัสผ่าน ไม่มีระบบรีเซ็ตอัตโนมัติ"),
        ("สมัครแล้วทำไมเข้าไม่ได้?",
         "ตรวจสอบว่ากรอกรหัสนักศึกษาครบ 13 หลัก และรหัสผ่านถูกต้อง "
         "ถ้ายังไม่ได้ให้ติดต่อประธาน"),
        ("เปลี่ยนหลักสูตรหรือข้อมูลส่วนตัวได้ไหม?",
         "ปัจจุบันต้องให้ประธานแก้ไขให้ผ่านหน้าแอดมิน"),
        ("รูปโปรไฟล์ไม่ขึ้น ทำอย่างไร?",
         "ลองรีเฟรชหน้า (Ctrl+Shift+R) หรือล้าง Cache แล้วลองใหม่"),
        ("ชั่วโมงสะสมไม่อัปเดต?",
         "ชั่วโมงจะนับเฉพาะกิจกรรมที่ประธานอนุมัติแล้วเท่านั้น สถานะ ⏳ ยังไม่นับ"),
        ("ยกเลิกการสมัครกิจกรรมได้ไหม?",
         "ได้ — เฉพาะรายการที่ยังมีสถานะ ⏳ รออนุมัติ กด 'ยกเลิก' ในหน้ากิจกรรม"),
        ("Export ไฟล์แล้วเปิดไม่ได้?",
         "ไฟล์เป็น .csv เปิดด้วย Excel (File > Open > เลือกไฟล์) "
         "หรือนำเข้า Google Sheets"),
        ("เว็บโหลดช้าหรือข้อมูลไม่อัปเดต?",
         "กด Ctrl+Shift+R (Windows) หรือ Cmd+Shift+R (Mac) เพื่อรีเฟรชแบบล้าง Cache"),
    ]

    for q, a in faqs:
        elems.append(KeepTogether([
            Paragraph(f"Q: {q}", ParagraphStyle("fq",
                fontName="Sarabun-Bold", fontSize=11, leading=16,
                textColor=NAVY, spaceBefore=10)),
            Paragraph(f"A: {a}", ParagraphStyle("fa",
                fontName="Sarabun", fontSize=11, leading=17,
                textColor=GREY, leftIndent=12, spaceAfter=4)),
            HRFlowable(width="100%", thickness=0.5, color=LGREY, spaceAfter=2),
        ]))

    elems.append(sp(20))
    # Footer box
    footer = Table([[Paragraph(
        "ติดต่อผู้ดูแลระบบ: ประธานกิจการนักศึกษา\n"
        "คณะมนุษยศาสตร์และสังคมศาสตร์ มหาวิทยาลัยสวนดุสิต\n"
        "เว็บไซต์: https://gitjha-d8454.web.app",
        ParagraphStyle("foot", fontName="Sarabun", fontSize=10, leading=16,
                       textColor=WHITE, alignment=1))]],
        colWidths=["100%"])
    footer.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY),
        ("LINEABOVE",     (0,0),(-1,-1), 3, GOLD),
        ("TOPPADDING",    (0,0),(-1,-1), 16),
        ("BOTTOMPADDING", (0,0),(-1,-1), 16),
    ]))
    elems.append(footer)
    return elems

# ── Page numbering ─────────────────────────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    page_num = canvas.getPageNumber()
    if page_num > 2:  # Skip cover + TOC
        canvas.setFont("Sarabun", 9)
        canvas.setFillColor(GREY)
        canvas.drawRightString(A4[0] - 1.5*cm, 1.2*cm, f"หน้า {page_num}")
        canvas.setFillColor(GOLD)
        canvas.rect(1.5*cm, 1*cm, A4[0]-3*cm, 1.5, fill=1, stroke=0)
    canvas.restoreState()

# ── Build PDF ──────────────────────────────────────────────────────────────────
OUT = os.path.join(FONT_DIR, "คู่มือการใช้งาน_ระบบกิจการนักศึกษา.pdf")

doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    rightMargin=1.8*cm, leftMargin=1.8*cm,
    topMargin=2*cm, bottomMargin=2*cm,
    title="คู่มือการใช้งาน ระบบกิจการนักศึกษา",
    author="คณะมนุษยศาสตร์และสังคมศาสตร์ มหาวิทยาลัยสวนดุสิต",
)

story = []
story += cover_page()
story += toc()
story += ch1()
story += ch2()
story += ch3()
story += ch4()
story += ch5()
story += ch6()
story += ch7()
story += ch8()
story += ch9()

doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print("Done")
