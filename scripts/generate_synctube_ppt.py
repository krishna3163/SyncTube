#!/usr/bin/env python3
"""
SyncTube PowerPoint Presentation Generator
Creates a professional, clean 16:9 widescreen presentation
following the coordinator-discussion style:
- Easy language & short, punchy points
- Bold highlighted keywords
- Practical workflow & real-world use cases (Students, Couples, Friends)
- Clean card-based visual design with embedded diagrams and screenshots
"""

import os
import sys
import pptx
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

# Color Palette
NAVY_PRIMARY = RGBColor(0x1A, 0x36, 0x5D)    # #1A365D - Headers / Dominant
BLUE_ACCENT  = RGBColor(0x2B, 0x5C, 0x8F)    # #2B5C8F - Subtitles / Cards
TEAL_HIGHLIGHT = RGBColor(0x0D, 0x94, 0x88)  # #0D9488 - Badges / Success
DARK_TEXT    = RGBColor(0x1F, 0x29, 0x37)    # #1F2937 - Body text
MUTED_TEXT   = RGBColor(0x4B, 0x55, 0x63)    # #4B5563 - Secondary text
CARD_BG      = RGBColor(0xF8, 0xFA, 0xFC)    # #F8FAFC - Card background
CARD_BORDER  = RGBColor(0xCB, 0xD5, 0xE1)    # #CBD5E1 - Border
WHITE        = RGBColor(0xFF, 0xFF, 0xFF)

def add_header(slide, slide_num_str, title_text, subtitle_text):
    """Adds a standard clean header to content slides."""
    # Top banner / Title box
    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.733), Inches(1.1))
    tf = txBox.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

    p_num = tf.paragraphs[0]
    p_num.text = slide_num_str.upper()
    p_num.font.name = 'Arial'
    p_num.font.size = Pt(11)
    p_num.font.bold = True
    p_num.font.color.rgb = TEAL_HIGHLIGHT
    p_num.space_after = Pt(2)

    p_title = tf.add_paragraph()
    p_title.text = title_text
    p_title.font.name = 'Arial'
    p_title.font.size = Pt(22)
    p_title.font.bold = True
    p_title.font.color.rgb = NAVY_PRIMARY
    p_title.space_after = Pt(2)

    p_sub = tf.add_paragraph()
    p_sub.text = subtitle_text
    p_sub.font.name = 'Arial'
    p_sub.font.size = Pt(12)
    p_sub.font.color.rgb = MUTED_TEXT

def create_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER):
    """Draws a rounded rectangular card container."""
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    shape.line.color.rgb = border_color
    shape.line.width = Pt(1.2)
    return shape

def add_bullet(tf, bold_prefix, text, font_size=13, space_after=8, text_color=DARK_TEXT):
    p = tf.add_paragraph()
    p.space_after = Pt(space_after)
    p.line_spacing = 1.2
    
    r_bullet = p.add_run()
    r_bullet.text = "• "
    r_bullet.font.name = 'Arial'
    r_bullet.font.size = Pt(font_size)
    r_bullet.font.bold = True
    r_bullet.font.color.rgb = BLUE_ACCENT

    if bold_prefix:
        r_bold = p.add_run()
        r_bold.text = bold_prefix + " "
        r_bold.font.name = 'Arial'
        r_bold.font.size = Pt(font_size)
        r_bold.font.bold = True
        r_bold.font.color.rgb = NAVY_PRIMARY

    r_txt = p.add_run()
    r_txt.text = text
    r_txt.font.name = 'Arial'
    r_txt.font.size = Pt(font_size)
    r_txt.font.color.rgb = text_color

def build_presentation(out_path):
    print(f"Generating presentation at: {out_path}")
    prs = pptx.Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # =========================================================================
    # SLIDE 1: Title Slide
    # =========================================================================
    slide1 = prs.slides.add_slide(blank_layout)

    # Decorative top bar
    top_bar = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.18))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = NAVY_PRIMARY
    top_bar.line.fill.background()

    # Logos Side by Side
    college_logo = "/tmp/ref_logos/college_logo.png"
    aktu_logo = "/tmp/ref_logos/aktu_logo.png"
    if os.path.exists(college_logo):
        slide1.shapes.add_picture(college_logo, Inches(4.8), Inches(0.6), height=Inches(1.2))
    if os.path.exists(aktu_logo):
        slide1.shapes.add_picture(aktu_logo, Inches(7.1), Inches(0.6), height=Inches(1.2))

    # Title & Subtitle Box
    txBox = slide1.shapes.add_textbox(Inches(1.0), Inches(1.9), Inches(11.333), Inches(2.5))
    tf = txBox.text_frame
    tf.word_wrap = True

    p_badge = tf.paragraphs[0]
    p_badge.alignment = PP_ALIGN.CENTER
    p_badge.text = "B.TECH COMPUTER SCIENCE & ENGINEERING • MINI PROJECT EVALUATION"
    p_badge.font.name = 'Arial'
    p_badge.font.size = Pt(11.5)
    p_badge.font.bold = True
    p_badge.font.color.rgb = TEAL_HIGHLIGHT
    p_badge.space_after = Pt(6)

    p_main = tf.add_paragraph()
    p_main.alignment = PP_ALIGN.CENTER
    p_main.text = "SyncTube: Real-Time Synchronized Watch Party Platform"
    p_main.font.name = 'Arial'
    p_main.font.size = Pt(30)
    p_main.font.bold = True
    p_main.font.color.rgb = NAVY_PRIMARY
    p_main.space_after = Pt(8)

    p_sub = tf.add_paragraph()
    p_sub.alignment = PP_ALIGN.CENTER
    p_sub.text = "Simple Questions • Short Answers • Practical Architecture & Live Workflow"
    p_sub.font.name = 'Arial'
    p_sub.font.size = Pt(15)
    p_sub.font.color.rgb = MUTED_TEXT

    # Info Card Container (Clean bottom section)
    create_card(slide1, Inches(1.5), Inches(4.5), Inches(10.333), Inches(2.2), bg_color=CARD_BG)

    # Left: Student details
    box_stud = slide1.shapes.add_textbox(Inches(1.8), Inches(4.7), Inches(4.8), Inches(1.8))
    tf_s = box_stud.text_frame
    p = tf_s.paragraphs[0]
    p.text = "SUBMITTED BY:"
    p.font.name = 'Arial'
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = BLUE_ACCENT
    p.space_after = Pt(4)

    p1 = tf_s.add_paragraph()
    p1.text = "Krishna Kumar (Roll No: 2303630100089)"
    p1.font.name = 'Arial'
    p1.font.size = Pt(13)
    p1.font.bold = True
    p1.font.color.rgb = DARK_TEXT

    p2 = tf_s.add_paragraph()
    p2.text = "Hareram Yadav (Roll No: 2303630100073)"
    p2.font.name = 'Arial'
    p2.font.size = Pt(13)
    p2.font.bold = True
    p2.font.color.rgb = DARK_TEXT

    p3 = tf_s.add_paragraph()
    p3.text = "B.Tech CSE – Section 4A • Batch: 2026–2027"
    p3.font.name = 'Arial'
    p3.font.size = Pt(11.5)
    p3.font.color.rgb = MUTED_TEXT

    # Right: Mentor details
    box_guide = slide1.shapes.add_textbox(Inches(7.0), Inches(4.7), Inches(4.5), Inches(1.8))
    tf_g = box_guide.text_frame
    p = tf_g.paragraphs[0]
    p.text = "UNDER THE GUIDANCE OF:"
    p.font.name = 'Arial'
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = BLUE_ACCENT
    p.space_after = Pt(4)

    p1 = tf_g.add_paragraph()
    p1.text = "MRS. SHIVANGI PANDEY"
    p1.font.name = 'Arial'
    p1.font.size = Pt(13.5)
    p1.font.bold = True
    p1.font.color.rgb = NAVY_PRIMARY

    p2 = tf_g.add_paragraph()
    p2.text = "Assistant Professor, Department of CSE"
    p2.font.name = 'Arial'
    p2.font.size = Pt(11.5)
    p2.font.color.rgb = DARK_TEXT

    p3 = tf_g.add_paragraph()
    p3.text = "Ambalika Institute of Management & Technology, Lucknow"
    p3.font.name = 'Arial'
    p3.font.size = Pt(11)
    p3.font.color.rgb = MUTED_TEXT

    # =========================================================================
    # SLIDE 2: 1. What Problem Are We Solving?
    # =========================================================================
    slide2 = prs.slides.add_slide(blank_layout)
    add_header(slide2, "1. PROBLEM DEFINITION", "What Problem Are We Solving?", "Modern video platforms are built for 1 person alone • Shared watching is broken")

    # Left Card: The Real Problems
    create_card(slide2, Inches(0.8), Inches(1.8), Inches(5.6), Inches(5.0))
    tx_box = slide2.shapes.add_textbox(Inches(1.1), Inches(2.0), Inches(5.0), Inches(4.5))
    tf = tx_box.text_frame
    tf.word_wrap = True
    
    p_head = tf.paragraphs[0]
    p_head.text = "THE PAIN POINTS TODAY"
    p_head.font.name = 'Arial'
    p_head.font.size = Pt(14)
    p_head.font.bold = True
    p_head.font.color.rgb = NAVY_PRIMARY
    p_head.space_after = Pt(10)

    add_bullet(tf, "Isolated Streaming:", "YouTube, Netflix, and OTT apps isolate every viewer into their own unicast stream.")
    add_bullet(tf, "Manual '3-2-1 Play' Fails:", "Different buffer speeds, network lag, and timer drift cause friends to desynchronize within minutes.")
    add_bullet(tf, "Mid-Roll Commercial Ads:", "Ads trigger at different times for each person, completely shattering synchronized movie or study sessions.")
    add_bullet(tf, "Algorithmic Doomscrolling:", "Clickbait sidebars and endless Shorts constantly distract students trying to watch study lectures.")

    # Right Card: The SyncTube Solution
    create_card(slide2, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0))
    tx_box2 = slide2.shapes.add_textbox(Inches(7.1), Inches(2.0), Inches(5.1), Inches(4.5))
    tf2 = tx_box2.text_frame
    tf2.word_wrap = True

    p_head2 = tf2.paragraphs[0]
    p_head2.text = "HOW SYNCTUBE FIXES IT"
    p_head2.font.name = 'Arial'
    p_head2.font.size = Pt(14)
    p_head2.font.bold = True
    p_head2.font.color.rgb = TEAL_HIGHLIGHT
    p_head2.space_after = Pt(10)

    add_bullet(tf2, "Authoritative Synchronization:", "Sub-100ms playout alignment. Play, pause, and seek happen simultaneously for everyone.")
    add_bullet(tf2, "Zero Ad Interruptions:", "Videos play cleanly without disruptive commercials interrupting lectures mid-sentence.")
    add_bullet(tf2, "Pure Cinema Interface:", "All recommendation sidebars and algorithm feeds are removed for complete learning focus.")
    add_bullet(tf2, "Zero Barriers to Entry:", "No account creation, no password fatigue, and no third-party extension installations required.")

    # =========================================================================
    # SLIDE 3: 2. Who Is This Platform Built For?
    # =========================================================================
    slide3 = prs.slides.add_slide(blank_layout)
    add_header(slide3, "2. TARGET AUDIENCE", "Who Is This Platform Built For?", "Tailored specifically for three high-demand everyday user demographics")

    card_w = Inches(3.64)
    card_h = Inches(5.0)

    # Card 1: Students
    create_card(slide3, Inches(0.8), Inches(1.8), card_w, card_h)
    tb1 = slide3.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(3.24), Inches(4.5))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    p.text = "🎓 STUDENTS & STUDY GROUPS"
    p.font.name = 'Arial'
    p.font.size = Pt(13.5)
    p.font.bold = True
    p.font.color.rgb = NAVY_PRIMARY
    p.space_after = Pt(8)
    add_bullet(tf1, "Playlist Import:", "Paste full YouTube course playlists (OS, DBMS, Gate Smashers, NPTEL).")
    add_bullet(tf1, "Ad-Free Learning:", "Zero commercial ads stopping lecture flow.")
    add_bullet(tf1, "No Distractions:", "No Shorts or clickbait feeds.")
    add_bullet(tf1, "Discussion Pauses:", "Pause synchronously to discuss doubts and take group notes.")

    # Card 2: Couples
    create_card(slide3, Inches(4.84), Inches(1.8), card_w, card_h)
    tb2 = slide3.shapes.add_textbox(Inches(5.04), Inches(2.0), Inches(3.24), Inches(4.5))
    tf2 = tb2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    p.text = "❤️ LONG-DISTANCE COUPLES"
    p.font.name = 'Arial'
    p.font.size = Pt(13.5)
    p.font.bold = True
    p.font.color.rgb = RGBColor(0xBE, 0x18, 0x5D)
    p.space_after = Pt(8)
    add_bullet(tf2, "Virtual Date Nights:", "Watch romantic movies, series, and vlogs together across cities.")
    add_bullet(tf2, "Emotional Sync:", "Laugh and cry at the exact same second with sub-100ms precision.")
    add_bullet(tf2, "Video Calling:", "Face-to-face WebRTC video & audio while watching.")
    add_bullet(tf2, "Floating Hearts:", "Send live floating reaction hearts.")

    # Card 3: Friends
    create_card(slide3, Inches(8.88), Inches(1.8), card_w, card_h)
    tb3 = slide3.shapes.add_textbox(Inches(9.08), Inches(2.0), Inches(3.24), Inches(4.5))
    tf3 = tb3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    p.text = "🍿 FRIENDS & WATCH PARTIES"
    p.font.name = 'Arial'
    p.font.size = Pt(13.5)
    p.font.bold = True
    p.font.color.rgb = TEAL_HIGHLIGHT
    p.space_after = Pt(8)
    add_bullet(tf3, "Weekend Marathons:", "Anime, comedy sketches, gaming clips, and movie nights.")
    add_bullet(tf3, "Democratic Queue:", "Everyone adds songs/clips and upvotes their favorites.")
    add_bullet(tf3, "Live Banter:", "Real-time threaded chat with emojis.")
    add_bullet(tf3, "Soundboard:", "Trigger funny sound effects in-sync.")

    # =========================================================================
    # SLIDE 4: 3. How Does It Work? (Workflow Walkthrough)
    # =========================================================================
    slide4 = prs.slides.add_slide(blank_layout)
    add_header(slide4, "3. SYSTEM WORKFLOW", "How Does SyncTube Work?", "A seamless 4-step user journey from zero to watching together in under 5 seconds")

    steps = [
        ("STEP 1", "Create a Room in 2 Seconds", "Enter your display name, pick an optional anime avatar, and click 'Start Watch Party'. No signup or password needed.", "#1A365D"),
        ("STEP 2", "Instant Share & Join", "Share the auto-generated 6-character room code, direct invite link, or display the scannable QR code to friends.", "#2B5C8F"),
        ("STEP 3", "Load Video or Playlist", "Paste any YouTube link, import an entire lecture playlist, or search videos directly from the built-in search bar.", "#0D9488"),
        ("STEP 4", "Enjoy Synchronized Media", "Play, pause, seek, chat, vote on the queue, or start video calling. The server coordinates state instantly.", "#1A365D")
    ]

    card_step_w = Inches(2.7)
    for i, (s_num, s_title, s_desc, color_hex) in enumerate(steps):
        left_pos = Inches(0.8 + i * 2.98)
        create_card(slide4, left_pos, Inches(1.8), card_step_w, Inches(4.9))
        tb = slide4.shapes.add_textbox(left_pos + Inches(0.2), Inches(2.0), card_step_w - Inches(0.4), Inches(4.5))
        tf = tb.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = s_num
        p.font.name = 'Arial'
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = TEAL_HIGHLIGHT
        p.space_after = Pt(4)

        p2 = tf.add_paragraph()
        p2.text = s_title
        p2.font.name = 'Arial'
        p2.font.size = Pt(14)
        p2.font.bold = True
        p2.font.color.rgb = NAVY_PRIMARY
        p2.space_after = Pt(12)

        p3 = tf.add_paragraph()
        p3.text = s_desc
        p3.font.name = 'Arial'
        p3.font.size = Pt(12)
        p3.font.color.rgb = DARK_TEXT
        p3.line_spacing = 1.3

    # =========================================================================
    # SLIDE 5: 4. How Do We Keep Everyone in Exact Sync?
    # =========================================================================
    slide5 = prs.slides.add_slide(blank_layout)
    add_header(slide5, "4. SYNCHRONIZATION MECHANISM", "How Do We Keep Everyone in Exact Sync?", "Authoritative clock offset calculation + 3-Tier Adaptive Drift Guard")

    # Left: Core Principles & Formulas
    create_card(slide5, Inches(0.8), Inches(1.8), Inches(5.6), Inches(5.0))
    tb_left = slide5.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(5.2), Inches(4.6))
    tf = tb_left.text_frame
    tf.word_wrap = True

    p = tf.paragraphs[0]
    p.text = "CORE SYNCHRONIZATION PRINCIPLE"
    p.font.name = 'Arial'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = NAVY_PRIMARY
    p.space_after = Pt(6)

    p_quote = tf.add_paragraph()
    p_quote.text = "“SyncTube synchronizes the watch experience, not the video stream.”"
    p_quote.font.name = 'Arial'
    p_quote.font.size = Pt(12)
    p_quote.font.bold = True
    p_quote.font.italic = True
    p_quote.font.color.rgb = BLUE_ACCENT
    p_quote.space_after = Pt(10)

    add_bullet(tf, "NTP Clock Offset Calculation:", "Clients periodically exchange timestamped probes (T0, T_server, T1) to calculate Round-Trip Time (RTT) and network latency.")
    add_bullet(tf, "Offset Formula:", "Δ = T_server - (T0 + RTT / 2). Every client accurately knows the true server clock position.")
    add_bullet(tf, "Target Playhead Formula:", "Pos_target = Pos_base + (T_now + Δ - lastUpdated).")
    add_bullet(tf, "Zero Stream Proxying:", "Video frames are rendered natively via YouTube IFrame API; our server only sends tiny JSON timeline sync events.")

    # Right: The 3-Tier Drift Guard Flow
    create_card(slide5, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0))
    fig_flow = "/tmp/synctube_charts_v2/fig_4_1_sync_flow.png"
    if os.path.exists(fig_flow):
        slide5.shapes.add_picture(fig_flow, Inches(7.0), Inches(2.0), width=Inches(5.3))

    # =========================================================================
    # SLIDE 6: 5. Why Is SyncTube a Game-Changer for Students?
    # =========================================================================
    slide6 = prs.slides.add_slide(blank_layout)
    add_header(slide6, "5. ACADEMIC USE-CASE", "Why Is SyncTube a Game-Changer for Students?", "Eliminating distractions and commercial interruptions from group study")

    create_card(slide6, Inches(0.8), Inches(1.8), Inches(5.6), Inches(5.0))
    tb_s1 = slide6.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(5.2), Inches(4.5))
    tf1 = tb_s1.text_frame
    tf1.word_wrap = True

    p = tf1.paragraphs[0]
    p.text = "FOCUSED GROUP STUDY & LECTURES"
    p.font.name = 'Arial'
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = NAVY_PRIMARY
    p.space_after = Pt(10)

    add_bullet(tf1, "Bulk Playlist Import:", "Students studying for semesters can paste entire course playlists (Operating Systems, DBMS, DSA). All videos queue automatically.")
    add_bullet(tf1, "Zero Commercial Mid-Roll Ads:", "Commercials that normally interrupt professors mid-explanation are completely eliminated.")
    add_bullet(tf1, "Distraction-Free Cinema UI:", "Strips away recommended feeds, clickbait thumbnails, and addictive Shorts that cause academic procrastination.")

    create_card(slide6, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0))
    tb_s2 = slide6.shapes.add_textbox(Inches(7.0), Inches(2.0), Inches(5.3), Inches(4.5))
    tf2 = tb_s2.text_frame
    tf2.word_wrap = True

    p = tf2.paragraphs[0]
    p.text = "COLLABORATIVE LEARNING TOOLS"
    p.font.name = 'Arial'
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = TEAL_HIGHLIGHT
    p.space_after = Pt(10)

    add_bullet(tf2, "Synchronous Doubt Pausing:", "When any student pauses to understand a complex diagram, it pauses for everyone. No student gets left behind.")
    add_bullet(tf2, "In-Room Note Sharing & Chat:", "Students share time-stamped notes, code snippets, and questions directly in the chat panel.")
    add_bullet(tf2, "Peer Accountability:", "Studying together in a virtual room creates healthy study discipline similar to sitting in a college library.")

    # =========================================================================
    # SLIDE 7: 6. Why Do Couples & Friends Love It?
    # =========================================================================
    slide7 = prs.slides.add_slide(blank_layout)
    add_header(slide7, "6. SOCIAL & RELATIONSHIP USE-CASES", "Why Do Couples & Friends Love It?", "Recreating the warmth of physical co-presence across distance")

    # Left: Couples
    create_card(slide7, Inches(0.8), Inches(1.8), Inches(5.6), Inches(5.0))
    tb_c = slide7.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(5.2), Inches(4.5))
    tfc = tb_c.text_frame
    tfc.word_wrap = True

    p = tfc.paragraphs[0]
    p.text = "❤️ FOR LONG-DISTANCE COUPLES"
    p.font.name = 'Arial'
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = RGBColor(0xBE, 0x18, 0x5D)
    p.space_after = Pt(10)

    add_bullet(tfc, "Zero Spoilers:", "Sub-100ms sync ensures partners react to emotional twists and jokes at the exact same physical moment.")
    add_bullet(tfc, "Face-to-Face Video Calling:", "Integrated WebRTC calling lets partners see each other's live facial expressions right next to the player.")
    add_bullet(tfc, "Floating Emoji Reactions:", "Heart and celebration animations float over the screen to express real-time affection.")

    # Right: Friends
    create_card(slide7, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0))
    tb_f = slide7.shapes.add_textbox(Inches(7.0), Inches(2.0), Inches(5.3), Inches(4.5))
    tff = tb_f.text_frame
    tff.word_wrap = True

    p = tff.paragraphs[0]
    p.text = "🍿 FOR FRIENDS & WATCH PARTIES"
    p.font.name = 'Arial'
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = TEAL_HIGHLIGHT
    p.space_after = Pt(10)

    add_bullet(tff, "Democratic Queue Voting:", "Everyone queues their favorite songs or movie clips; the community votes, and the top song plays next automatically.")
    add_bullet(tff, "Live Chat Replies & Banter:", "Full threaded messaging for funny commentary and group jokes.")
    add_bullet(tff, "Soundboard Effects & Polls:", "Trigger synchronized comedy sound effects and create instant group polls ('What should we watch next?').")

    # =========================================================================
    # SLIDE 8: 7. What About Installation, Privacy & Security?
    # =========================================================================
    slide8 = prs.slides.add_slide(blank_layout)
    add_header(slide8, "7. ARCHITECTURAL SANITY", "What About Installation, Privacy & Security?", "Zero installation, zero DRM circumvention, and zero data harvesting")

    items = [
        ("ZERO BROWSER EXTENSIONS", "Runs purely in standard web browsers (Chrome, Edge, Firefox, Safari). No extension installation that scares non-technical users or gets blocked by college IT firewalls."),
        ("ZERO MANDATORY SIGN-UP", "Users can spin up or join a room in seconds with only a display name and room code. Eliminates account creation fatigue and prevents email spam."),
        ("ZERO DRM VIOLATIONS", "SyncTube adheres strictly to copyright law. We do not download, proxy, or re-encode video streams. Video rendering is delegated directly to the official YouTube IFrame player."),
        ("STRICT BACKEND VALIDATION", "All WebSocket payloads and REST endpoints pass through runtime Zod schema validation, blocking malformed event injections and protecting room states.")
    ]

    for i, (title_str, desc_str) in enumerate(items):
        top_pos = Inches(1.8 + i * 1.25)
        create_card(slide8, Inches(0.8), top_pos, Inches(11.733), Inches(1.1))
        tb = slide8.shapes.add_textbox(Inches(1.1), top_pos + Inches(0.12), Inches(11.1), Inches(0.9))
        tf = tb.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = title_str
        p.font.name = 'Arial'
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = NAVY_PRIMARY
        p.space_after = Pt(3)

        p2 = tf.add_paragraph()
        p2.text = desc_str
        p2.font.name = 'Arial'
        p2.font.size = Pt(11.5)
        p2.font.color.rgb = DARK_TEXT

    # =========================================================================
    # SLIDE 9: 8. Why Not Just Use Existing Services?
    # =========================================================================
    slide9 = prs.slides.add_slide(blank_layout)
    add_header(slide9, "8. COMPETITIVE MATRIX", "Why Not Just Use Existing Services?", "Direct comparison across key usability, technical, and feature dimensions")

    # Add Clean Comparison Table
    table_shape = slide9.shapes.add_table(5, 5, Inches(0.8), Inches(1.9), Inches(11.733), Inches(4.8))
    table = table_shape.table

    table_data = [
        ["Feature / Dimension", "SyncTube (Our System)", "Teleparty (Netflix Party)", "Watch2Gether", "Discord Watch Together"],
        ["Installation Required", "Zero Install (Web Native)", "Mandatory Extension", "Zero Install (Web Native)", "Discord App Required"],
        ["Account Creation", "Optional (Instant Code)", "Mandatory Sign-Up", "Optional", "Mandatory Discord Acct"],
        ["Ad-Free Cinema Stage", "Yes (No Ads / No Feeds)", "No (Standard UI)", "No (Heavy Banner Ads)", "No (Discord Overlay)"],
        ["Playlist Queue & Voting", "Full Import & Upvoting", "No Playlist Import", "Basic Manual Queue", "Basic Queue Only"],
        ["Playout Sync Precision", "Sub-100ms (NTP + Skew)", "300ms – 1200ms", "250ms – 800ms", "150ms – 500ms"],
        ["Built-in Video Calling", "WebRTC Video/Audio Call", "Text Chat Only", "Laggy P2P Mesh", "Discord Voice/Video"],
        ["Mobile Phone Usability", "Dedicated Touch Dock", "No Mobile Support", "Limited Mobile Web", "Mobile App Only"]
    ]

    # Re-create table with 9 rows
    slide9.shapes._spTree.remove(table_shape._element)
    table_shape = slide9.shapes.add_table(len(table_data), 5, Inches(0.8), Inches(1.8), Inches(11.733), Inches(5.0))
    table = table_shape.table

    for r_idx, row in enumerate(table_data):
        for c_idx, val in enumerate(row):
            cell = table.cell(r_idx, c_idx)
            cell.text = val
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER if c_idx > 0 else PP_ALIGN.LEFT
            p.font.name = 'Arial'
            if r_idx == 0:
                p.font.size = Pt(11.5)
                p.font.bold = True
                p.font.color.rgb = WHITE
                cell.fill.solid()
                cell.fill.fore_color.rgb = NAVY_PRIMARY
            else:
                p.font.size = Pt(10.5)
                if c_idx == 1:
                    p.font.bold = True
                    p.font.color.rgb = TEAL_HIGHLIGHT
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = RGBColor(0xF0, 0xFD, 0xFA)
                else:
                    p.font.color.rgb = DARK_TEXT
                    if r_idx % 2 == 1:
                        cell.fill.solid()
                        cell.fill.fore_color.rgb = CARD_BG

    # =========================================================================
    # SLIDE 10: 9. System Architecture & Tech Stack
    # =========================================================================
    slide10 = prs.slides.add_slide(blank_layout)
    add_header(slide10, "9. SYSTEM ARCHITECTURE", "System Architecture & Engineering Stack", "Built with modern, production-tested full-stack web technologies")

    # Left: Architecture Diagram
    create_card(slide10, Inches(0.8), Inches(1.8), Inches(6.8), Inches(5.0))
    fig_arch = "/tmp/synctube_charts_v2/fig_3_1_architecture.png"
    if os.path.exists(fig_arch):
        slide10.shapes.add_picture(fig_arch, Inches(1.0), Inches(2.0), width=Inches(6.4))

    # Right: Stack Details
    create_card(slide10, Inches(7.9), Inches(1.8), Inches(4.6), Inches(5.0))
    tb_st = slide10.shapes.add_textbox(Inches(8.1), Inches(2.0), Inches(4.2), Inches(4.5))
    tf_st = tb_st.text_frame
    tf_st.word_wrap = True

    p = tf_st.paragraphs[0]
    p.text = "CORE TECHNOLOGY STACK"
    p.font.name = 'Arial'
    p.font.size = Pt(13.5)
    p.font.bold = True
    p.font.color.rgb = NAVY_PRIMARY
    p.space_after = Pt(8)

    add_bullet(tf_st, "Client Frontend:", "React 18/19, TypeScript, Vite, Glassmorphic CSS with ambient player lighting.")
    add_bullet(tf_st, "Real-Time Engine:", "Node.js, Express, Socket.IO v4 full-duplex WebSocket bus with Zod validation.")
    add_bullet(tf_st, "Media Calling:", "WebRTC (RFC 8825) with Google STUN and configurable TURN traversal.")
    add_bullet(tf_st, "Data Tier:", "In-Memory volatile store (sub-millisecond room state) + PostgreSQL history database.")
    add_bullet(tf_st, "Cloud Edge:", "Deployed on Vercel CDN (Frontend) and Render Cloud (Backend Server).")

    # =========================================================================
    # SLIDE 11: 10. Performance Benchmarks & Testing Results
    # =========================================================================
    slide11 = prs.slides.add_slide(blank_layout)
    add_header(slide11, "10. RESULTS & BENCHMARKS", "What Makes the Project Successful?", "Empirical performance testing and user satisfaction metrics")

    # Left: Drift Chart
    create_card(slide11, Inches(0.8), Inches(1.8), Inches(5.6), Inches(5.0))
    c_drift = "/tmp/synctube_charts_v2/chart_7_1_drift.png"
    if os.path.exists(c_drift):
        slide11.shapes.add_picture(c_drift, Inches(1.0), Inches(2.0), width=Inches(5.2))

    # Right: Satisfaction Chart
    create_card(slide11, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0))
    c_pers = "/tmp/synctube_charts_v2/chart_7_3_personas.png"
    if os.path.exists(c_pers):
        slide11.shapes.add_picture(c_pers, Inches(7.0), Inches(2.0), width=Inches(5.3))

    # =========================================================================
    # SLIDE 12: 11. Core Pitch & Future Roadmap
    # =========================================================================
    slide12 = prs.slides.add_slide(blank_layout)
    add_header(slide12, "11. SUMMARY & ROADMAP", "Our Core Pitch & Future Roadmap", "Transforming isolated video watching into a shared, productive, and fun social reality")

    # Top Card: The Core Pitch
    create_card(slide12, Inches(0.8), Inches(1.8), Inches(11.733), Inches(2.3), bg_color=RGBColor(0xF0, 0xFD, 0xFA), border_color=TEAL_HIGHLIGHT)
    tb_pitch = slide12.shapes.add_textbox(Inches(1.1), Inches(2.0), Inches(11.1), Inches(1.9))
    tf_p = tb_pitch.text_frame
    tf_p.word_wrap = True

    p = tf_p.paragraphs[0]
    p.text = "🎯 OUR CORE PITCH"
    p.font.name = 'Arial'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = TEAL_HIGHLIGHT
    p.space_after = Pt(4)

    p_txt = tf_p.add_paragraph()
    p_txt.text = (
        "“SyncTube brings people together to watch YouTube in perfect real-time sync. "
        "With zero ads, zero algorithmic distractions, instant 6-character room codes, collaborative playlist voting, "
        "and integrated video calling, it is the ultimate shared viewing platform for students, couples, and friends.”"
    )
    p_txt.font.name = 'Arial'
    p_txt.font.size = Pt(14)
    p_txt.font.bold = True
    p_txt.font.color.rgb = NAVY_PRIMARY
    p_txt.line_spacing = 1.3

    # Bottom Card: Future Scope
    create_card(slide12, Inches(0.8), Inches(4.4), Inches(11.733), Inches(2.5))
    tb_fut = slide12.shapes.add_textbox(Inches(1.1), Inches(4.6), Inches(11.1), Inches(2.1))
    tf_f = tb_fut.text_frame
    tf_f.word_wrap = True

    p = tf_f.paragraphs[0]
    p.text = "🚀 FUTURE SCOPE & ENHANCEMENTS"
    p.font.name = 'Arial'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = NAVY_PRIMARY
    p.space_after = Pt(6)

    add_bullet(tf_f, "Multi-Region Redis Pub/Sub Cluster:", "Scale room state horizontally across global cloud servers for international watch parties.")
    add_bullet(tf_f, "Progressive Web App (PWA):", "Enable mobile background audio and Picture-in-Picture (PiP) support for smartphones.")
    add_bullet(tf_f, "AI Real-Time Subtitles:", "On-device speech-to-text generating real-time multilingual subtitles for educational lectures.")

    # Save Presentation
    prs.save(out_path)
    print(f"Presentation successfully saved to: {out_path}")

if __name__ == '__main__':
    out_file = sys.argv[1] if len(sys.argv) > 1 else "/home/krishna/Downloads/SyncTube_Project_Presentation.pptx"
    build_presentation(out_file)

