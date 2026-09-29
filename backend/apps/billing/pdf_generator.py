import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from django.core.files.base import ContentFile

def generate_bill_pdf_bytes(bill):
    """Generates an enterprise-grade PDF invoice for a Gawali monthly milk bill."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    primary_color = colors.HexColor('#0ea371')
    dark_color = colors.HexColor('#0f172a')
    muted_color = colors.HexColor('#64748b')

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        textColor=primary_color,
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=muted_color,
        spaceAfter=15,
    )
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        textColor=dark_color,
        spaceAfter=6,
    )
    normal_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        textColor=dark_color,
        leading=13,
    )

    story = []

    # Header Row
    header_data = [
        [
            Paragraph("<b>GAWALI</b><br/><font size=8 color='#64748b'>Your milkman, in your pocket</font>", title_style),
            Paragraph(f"<b>INVOICE #{str(bill.id)[:8].upper()}</b><br/>Month: {bill.billing_month.strftime('%B %Y')}<br/>Status: <b>{bill.status.upper()}</b>", normal_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[300, 240])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=15))

    # Dairy & Customer Info Table
    dairy = bill.dairy
    customer = bill.customer
    info_data = [
        [
            Paragraph("<b>ISSUED BY (VENDOR):</b>", section_style),
            Paragraph("<b>BILLED TO (CUSTOMER):</b>", section_style),
        ],
        [
            Paragraph(f"<b>{dairy.business_name}</b><br/>Phone: {dairy.phone}<br/>City: {dairy.city}, {dairy.state}<br/>UPI ID: {dairy.bank_upi_id or 'Available in App'}", normal_style),
            Paragraph(f"<b>{customer.user.full_name}</b><br/>Phone: {customer.user.phone or 'N/A'}<br/>Address: {customer.address}<br/>Route: {customer.delivery_route.name if customer.delivery_route else 'General'}", normal_style)
        ]
    ]
    info_table = Table(info_data, colWidths=[270, 270])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))

    # Items Table
    table_data = [
        ["Date", "Description", "Delivered Qty", "Rate (₹)", "Amount (₹)"]
    ]

    items = bill.items.all().order_by('date')
    if items.exists():
        for item in items:
            table_data.append([
                item.date.strftime('%d %b %Y'),
                item.item_name,
                f"{item.quantity:.1f} L",
                f"₹{item.unit_price:.2f}",
                f"₹{item.total_amount:.2f}"
            ])
    else:
        table_data.append([
            bill.billing_month.strftime('%B %Y'),
            f"Monthly Milk Subscription ({bill.total_quantity:.1f} L delivered)",
            f"{bill.total_quantity:.1f} L",
            "-",
            f"₹{bill.total_amount:.2f}"
        ])

    # Summary Rows
    table_data.append(["", "", "", "Total Delivered:", f"{bill.total_quantity:.1f} L"])
    table_data.append(["", "", "", "Total Billed:", f"₹{bill.total_amount:.2f}"])
    table_data.append(["", "", "", "Paid Amount:", f"₹{bill.paid_amount:.2f}"])
    table_data.append(["", "", "", "Outstanding Due:", f"₹{bill.due_amount:.2f}"])

    items_table = Table(table_data, colWidths=[80, 200, 90, 80, 90])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea371')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -5), 0.5, colors.HexColor('#cbd5e1')),
        ('LINEBELOW', (0, -4), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('FONTNAME', (3, -4), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (3, -1), (-1, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (4, -1), (4, -1), colors.HexColor('#dc2626') if bill.due_amount > 0 else colors.HexColor('#059669')),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 25))

    # Footer Notes
    footer_text = (
        "<b>Payment Instructions:</b> Pay conveniently through UPI, Cards, or Netbanking in the Gawali Mobile App. "
        "For queries, contact your milk vendor directly. Thank you for choosing Gawali!"
    )
    story.append(Paragraph(footer_text, normal_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
