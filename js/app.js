/* ==========================================================================
   SafaCycle Chitwan — application logic
   Vanilla ES module. Firebase modules are loaded lazily from the official
   gstatic CDN so the page keeps working if Firebase is unavailable.
   All user or database content is rendered with textContent (never innerHTML).
   ========================================================================== */

/* ---------- Configuration ---------- */
const FIREBASE_VERSION = "12.19.0";
const fbUrl = (mod) => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-${mod}.js`;

// Firebase web config identifies the project; it is not a secret.
// Security comes from Firestore rules, Auth settings and App Check.
const firebaseConfig = {
  apiKey: "AIzaSyDHtlnEl98UpddI0HVOM74HZ29F35qZ3HY",
  authDomain: "kabadi-chitwan.firebaseapp.com",
  projectId: "kabadi-chitwan",
  storageBucket: "kabadi-chitwan.firebasestorage.app",
  messagingSenderId: "173243868190",
  appId: "1:173243868190:web:9b5218e6290d26663d3a0f",
  measurementId: "G-5NB6R0C467"
};

const CONFIG = {
  ASSISTANT_ENABLED: false,           // hidden: the backend-powered Waste Expert (js/safacycle-chatbot.js) is the site chatbot
  AI_ENABLED: false,                  // FAQ-only: the project uses no generative-AI APIs (the rule-based Waste Expert is in ai_backend/)
  AI_MODEL: "gemini-3.5-flash-lite",  // verified against Firebase AI Logic model list (Sept 2026)
  AI_MAX_REQUESTS_PER_SESSION: 8,
  AI_COOLDOWN_MS: 15000,
  AI_TIMEOUT_MS: 15000,
  CHAT_MAX_CHARS: 300,
  APP_CHECK_SITE_KEY: "",             // paste your reCAPTCHA v3 site key to enable App Check
  ANALYTICS_ENABLED: true,
  RATE_CACHE_TTL_MS: 6 * 60 * 60 * 1000,
  RATE_FALLBACK_TTL_MS: 30 * 60 * 1000,
  WRITE_TIMEOUT_MS: 20000,
  READ_TIMEOUT_MS: 8000,
  TRACK_MAX_FAILS: 5,
  TRACK_LOCK_MS: 60000
};

const AI_SYSTEM_INSTRUCTION = [
  "You are Safa Assistant for SafaCycle Chitwan, a doorstep scrap collection and recycling website starting in Bharatpur, Chitwan, Nepal.",
  "Help visitors understand this website, prepare recyclable scrap, navigate estimated rates, request pickups, and find services.",
  "Keep answers concise and practical, under 90 words, in plain text without markdown.",
  "Never invent rates, prices, booking statuses, contact details, opening hours, service guarantees, or policies.",
  "Never request sensitive personal information such as phone numbers, addresses, emails or passwords.",
  "For account-specific questions, direct users to My Pickups, Track, or the Contact section.",
  "Website sections: Check area, Scrap categories, Rate board, Calculator, Book pickup (5 steps), Track (code + last 4 phone digits), My Pickups (after login), Business inquiry, Recycling toolkit (preparation guide, impact estimator, reminders, community day, sample receipt), FAQ, Contact.",
  "Accepted categories: paper and cardboard, plastic, iron and steel, aluminium, copper and brass, glass, e-waste, batteries, appliances, mixed household scrap.",
  "Safely redirect hazardous-waste questions (chemicals, medical waste, gas cylinders, leaking batteries) to the local municipality or qualified hazardous-waste services, and emergencies to emergency services.",
  "You are an automated assistant, not a human. If you do not know, say so and point to the relevant section."
].join(" ");

/* ---------- Static data ---------- */
const CATEGORIES = [
  { id: "paper", en: "Paper & cardboard", ne: "कागज र कार्टुन" },
  { id: "plastic", en: "Plastic", ne: "प्लास्टिक" },
  { id: "iron", en: "Iron & steel", ne: "फलाम र स्टिल" },
  { id: "aluminium", en: "Aluminium", ne: "एल्मुनियम" },
  { id: "copper", en: "Copper & brass", ne: "तामा र पित्तल" },
  { id: "glass", en: "Glass", ne: "सिसा" },
  { id: "ewaste", en: "E-waste", ne: "इ-फोहोर" },
  { id: "batteries", en: "Batteries", ne: "ब्याट्री" },
  { id: "appliances", en: "Appliances", ne: "घरायसी उपकरण" },
  { id: "mixed", en: "Mixed household", ne: "मिश्रित घरायसी" }
];
const CAT_IDS = CATEGORIES.map((c) => c.id);

// DEMO figures for layout and planning only. Not verified market prices.
const DEMO_RATES = [
  { id: "d-newspaper", cat: "paper", en: "Newspaper", ne: "पत्रिका", unit: "kg", min: 15, max: 20 },
  { id: "d-cardboard", cat: "paper", en: "Cardboard / cartons", ne: "कार्टुन", unit: "kg", min: 10, max: 16 },
  { id: "d-books", cat: "paper", en: "Books & copies", ne: "किताब र कापी", unit: "kg", min: 12, max: 18 },
  { id: "d-pet", cat: "plastic", en: "PET bottles", ne: "प्लास्टिक बोतल", unit: "kg", min: 18, max: 28 },
  { id: "d-hardplastic", cat: "plastic", en: "Hard plastic (buckets, crates)", ne: "कडा प्लास्टिक", unit: "kg", min: 15, max: 25 },
  { id: "d-softplastic", cat: "plastic", en: "Mixed / soft plastic", ne: "मिश्रित प्लास्टिक", unit: "kg", min: 5, max: 10 },
  { id: "d-iron", cat: "iron", en: "Iron (mixed)", ne: "फलाम (मिश्रित)", unit: "kg", min: 32, max: 42 },
  { id: "d-steel", cat: "iron", en: "Stainless steel", ne: "स्टिल", unit: "kg", min: 50, max: 70 },
  { id: "d-tin", cat: "iron", en: "Tin sheets & cans", ne: "टिन", unit: "kg", min: 20, max: 28 },
  { id: "d-alu-cans", cat: "aluminium", en: "Aluminium cans", ne: "एल्मुनियम क्यान", unit: "kg", min: 110, max: 150 },
  { id: "d-alu-utensils", cat: "aluminium", en: "Aluminium utensils & frames", ne: "एल्मुनियम भाँडा र फ्रेम", unit: "kg", min: 150, max: 200 },
  { id: "d-copper", cat: "copper", en: "Copper wire / pipe", ne: "तामाको तार / पाइप", unit: "kg", min: 650, max: 850 },
  { id: "d-brass", cat: "copper", en: "Brass items", ne: "पित्तलका सामान", unit: "kg", min: 400, max: 520 },
  { id: "d-glass", cat: "glass", en: "Glass bottles & jars", ne: "सिसाका बोतल", unit: "kg", min: 1, max: 4 },
  { id: "d-phone", cat: "ewaste", en: "Old mobile phone", ne: "पुरानो मोबाइल", unit: "pc", min: 30, max: 150 },
  { id: "d-laptop", cat: "ewaste", en: "Laptop / desktop CPU", ne: "ल्यापटप / कम्प्युटर", unit: "pc", min: 300, max: 900 },
  { id: "d-cables", cat: "ewaste", en: "Cables & chargers", ne: "तार र चार्जर", unit: "kg", min: 40, max: 90 },
  { id: "d-leadbattery", cat: "batteries", en: "Inverter / vehicle battery", ne: "इन्भर्टर / गाडीको ब्याट्री", unit: "kg", min: 70, max: 100 },
  { id: "d-fridge", cat: "appliances", en: "Refrigerator", ne: "फ्रिज", unit: "pc", min: 1200, max: 2500 },
  { id: "d-washer", cat: "appliances", en: "Washing machine", ne: "वासिङ मेसिन", unit: "pc", min: 700, max: 1400 },
  { id: "d-fan", cat: "appliances", en: "Fan / cooler", ne: "पंखा / कुलर", unit: "pc", min: 150, max: 500 },
  { id: "d-mixed", cat: "mixed", en: "Mixed dry recyclables", ne: "मिश्रित सुक्खा कबाडी", unit: "kg", min: 6, max: 12 }
];

// Initial launch configuration. Not a guaranteed permanent service map.
const AREAS = [
  { en: "Narayangarh", ne: "नारायणगढ", status: "available", alt: ["narayangadh", "narayanghat"] },
  { en: "Bharatpur", ne: "भरतपुर", status: "available", alt: ["bharatpur city", "bharatpur bazaar"] },
  { en: "Hakim Chowk", ne: "हाकिम चोक", status: "available", alt: ["hakimchowk"] },
  { en: "Chaubiskothi", ne: "चौबीसकोठी", status: "available", alt: ["chaubis kothi"] },
  { en: "Pulchowk", ne: "पुल्चोक", status: "available", alt: ["pul chowk"] },
  { en: "Lions Chowk", ne: "लायन्स चोक", status: "available", alt: ["lion chowk", "lionschowk"] },
  { en: "Buspark", ne: "बसपार्क", status: "available", alt: ["bus park", "bharatpur buspark"] },
  { en: "Cancer Gate", ne: "क्यान्सर गेट", status: "available", alt: ["cancer hospital"] },
  { en: "Bhojad", ne: "भोजाड", status: "available", alt: [] },
  { en: "Gitanagar", ne: "गीतानगर", status: "limited", alt: ["geetanagar"] },
  { en: "Kshetrapur", ne: "क्षेत्रपुर", status: "limited", alt: ["chhetrapur", "shetrapur"] },
  { en: "Sharadanagar", ne: "शारदानगर", status: "limited", alt: [] },
  { en: "Mangalpur", ne: "मंगलपुर", status: "limited", alt: [] },
  { en: "Ratnanagar (Tandi)", ne: "रत्ननगर (टाँडी)", status: "limited", alt: ["tandi", "ratnanagar"] },
  { en: "Gaindakot", ne: "गैँडाकोट", status: "limited", alt: [] }
];

const PICKUP_STATUSES = ["requested", "confirmed", "assigned", "on_the_way", "collected", "completed"];
const CANCELLABLE = ["requested", "confirmed"];

/* ---------- Translations ---------- */
// English for static HTML comes from the markup itself; `en` below covers
// strings generated in JavaScript. `ne` covers both.
const I18N = {
  en: {
    lang_to_ne: "Switch language to Nepali",
    lang_to_en: "Switch language to English",
    login: "Log in", my_pickups: "My Pickups", account: "Account",
    fb_unavailable: "Online features are temporarily unavailable. You can still browse rates, use the calculator and read the guides.",
    err_permission: "This action was blocked by the server's security settings. Please try again later or use the Contact section.",
    err_offline: "You appear to be offline. Please reconnect and try again.",
    err_fb: "Online services are not available right now. Please try again later.",
    err_timeout: "The server is taking too long to respond. Please check your connection and try again.",
    err_generic: "Something went wrong. Please try again.",
    v_required: "This field is required.",
    v_email: "Enter a valid email address.",
    v_phone: "Enter a valid Nepal phone number, e.g. 98XXXXXXXX or 056-XXXXXX.",
    v_url: "Enter a full link starting with https://",
    v_ward: "Enter a ward number between 1 and 35.",
    v_date: "Choose today or a future date.",
    v_number: "Enter a valid number (0 or more).",
    v_code: "Tracking codes look like SC-AB12-CD34.",
    v_last4: "Enter exactly 4 digits.",
    v_password: "Use at least 8 characters, including letters and numbers.",
    v_minlen: "Please enter at least {n} characters.",
    v_materials: "Choose at least one material category.",
    v_consent: "Please accept the privacy notice to continue.",
    v_contact_need: "Please add an email or a phone number so we can reply.",
    v_fix: "Please fix the highlighted fields.",
    step_of: "Step {n} of {total}",
    added_calc: "{name} added to the calculator.",
    view_calc: "View",
    calc_need_items: "Add at least one material with a weight or quantity first.",
    calc_sent: "Your calculator list was added to the booking form.",
    rate_demo_badge: "Demo estimated rates",
    rate_live_badge: "Published estimated rates",
    rate_flag_demo: "Demo",
    rate_flag_est: "Estimate",
    rates_count: "{n} materials shown",
    demo_est: "Demo estimated rate",
    est_rate: "Estimated rate",
    varies: "varies by item",
    all: "All",
    per_kg: "/kg", per_pc: "/piece", unit_kg: "kg", unit_pc: "pcs",
    material: "Material", quantity: "Quantity", estimate: "Estimate", remove: "Remove",
    remove_row: "Remove {name}",
    add: "Add",
    cov_available: "Available",
    cov_available_d: "Regular pickups are planned in {area}. You can book now.",
    cov_limited: "Limited",
    cov_limited_d: "Pickups in {area} run on selected days. Book and the team will confirm the nearest date.",
    cov_none: "Request coverage",
    cov_none_d: "{area} is not in our initial service list yet. Leave a request and we will count it when we plan new routes.",
    cov_sent: "Thanks! Your coverage request for {area} was recorded.",
    cov_already: "You already requested this area in this session.",
    book_now: "Book a pickup",
    guest_hint: "Booking as a guest. Log in if you want this request to appear in My Pickups.",
    user_hint: "Signed in as {name}. This request will appear in My Pickups.",
    booking_success: "Pickup request submitted.",
    rv_name: "Name", rv_email: "Email", rv_phone: "Phone", rv_contact: "Contact via",
    rv_location: "Location", rv_landmark: "Landmark", rv_address: "Address", rv_map: "Map link",
    rv_materials: "Materials", rv_items: "Calculator items", rv_weight: "Approx. weight", rv_qty: "Items / bags",
    rv_value: "Estimated value", rv_notes: "Notes", rv_photo: "Photo link", rv_schedule: "Preferred time",
    rv_alt: "Alternative time", rv_urgency: "Urgency", rv_recurring: "Repeat", rv_ward: "Ward",
    rv_status: "Status", rv_created: "Requested on", rv_code: "Tracking code", rv_final: "Final amount",
    none: "—",
    c_call: "Phone call", c_sms: "SMS", c_whatsapp: "WhatsApp / Viber", c_email: "Email",
    u_flexible: "Flexible", u_standard: "Standard", u_priority: "Priority",
    r_none: "One-time", r_weekly: "Weekly", r_biweekly: "Every two weeks", r_monthly: "Monthly",
    track_not_found: "No pickup matches this code and phone digits. Check both and try again.",
    track_locked: "Too many attempts. Please wait a minute before trying again.",
    track_area: "Area", track_date: "Preferred date", track_slot: "Time slot", track_updated: "Last update",
    ps_requested: "Requested", ps_confirmed: "Confirmed", ps_assigned: "Collector assigned", ps_on_the_way: "On the way",
    ps_collected: "Collected", ps_completed: "Completed", ps_cancelled: "Cancelled",
    psd_requested: "We have received your request.",
    psd_confirmed: "Your time slot has been confirmed.",
    psd_assigned: "A collection team member has been assigned.",
    psd_on_the_way: "The team is heading to your location.",
    psd_collected: "Your materials were weighed and collected.",
    psd_completed: "Payment and records are complete.",
    psd_cancelled: "This request was cancelled.",
    dash_loading: "Loading your pickups…",
    dash_empty: "No pickup requests yet. Your bookings will appear here.",
    dash_empty_filter: "No requests with this status.",
    dash_error: "We couldn't load your pickups right now.",
    f_all: "All", f_active: "Active", f_completed: "Completed", f_cancelled: "Cancelled",
    details: "Details", rebook: "Rebook", cancel: "Cancel",
    cancel_confirm: "Cancel pickup {code}? This cannot be undone.",
    cancelled_ok: "Pickup {code} was cancelled.",
    rebook_ok: "Your previous details were copied into the booking form. Please choose a new date.",
    prefs_saved: "Preferences saved.",
    welcome: "Welcome, {name}!",
    logged_out: "You have been logged out.",
    reset_sent: "If an account exists for that email, a reset link has been sent.",
    register_ok: "Account created. Welcome to SafaCycle!",
    ae_invalid: "Email or password is incorrect.",
    ae_exists: "An account already exists with this email. Try logging in.",
    ae_weak: "Please choose a stronger password (at least 8 characters).",
    ae_not_enabled: "This sign-in method is not enabled yet. Please try another option.",
    ae_popup: "The sign-in window was closed before finishing.",
    ae_popup_blocked: "Your browser blocked the sign-in window. Allow pop-ups and try again.",
    ae_too_many: "Too many attempts. Please wait a few minutes and try again.",
    ae_network: "Network problem. Please check your connection.",
    ae_domain: "This website address is not authorised for sign-in yet.",
    member_since: "Member since {date}",
    not_recorded: "Not recorded yet",
    receipt_pending: "A receipt appears here after the team records final weights. Below is a sample only.",
    receipt_real: "Receipt",
    sample_label: "SAMPLE · NOT A REAL TRANSACTION",
    total: "Total", weight: "Weight", amount: "Amount",
    copied: "Tracking code copied.",
    copy_failed: "Couldn't copy automatically. Please select the code and copy it.",
    biz_sent: "Thank you! Your business inquiry was received.",
    comm_sent: "Thanks! Your interest in a community collection day was recorded.",
    contact_sent: "Message sent. We'll reply using the contact details you provided.",
    rem_saved: "Reminder saved in this browser.",
    rem_off: "Reminder turned off.",
    rem_next: "Next reminder: {date}",
    rem_none: "No reminder set.",
    rem_due: "Recycling reminder: it's a good time to gather and sort your scrap. Book a pickup when you're ready.",
    rem_perm_denied: "Browser notifications are blocked, so reminders will show only on this page.",
    rem_perm_on: "Browser notifications are allowed.",
    rem_perm_unsupported: "This browser doesn't support notifications, so reminders will show only on this page.",
    launching: "Launching soon",
    chat_welcome: "Namaste! I'm Safa Assistant, an automated helper. Ask me about booking, materials, rates, service areas or preparing your scrap. Choose a question below or type your own.",
    chat_fallback: "I don't have a reliable answer for that. Please check the FAQ or send a message through Contact.",
    chat_limit: "You've reached the limit for advanced answers in this session. Common questions still work, and you can also use the FAQ or Contact.",
    chat_cooldown: "Please wait {s} seconds before asking another advanced question.",
    chat_busy: "Still working on your previous question…",
    chat_pii: "For your privacy, please don't share phone numbers, emails or addresses in chat. Use the booking or contact forms instead. Your message was not sent anywhere.",
    chat_ai_off: "Advanced answers are temporarily unavailable. Common questions still work.",
    chat_ai_src: "AI answer · may contain mistakes",
    chat_faq_src: "From our FAQ",
    chat_cleared: "Chat cleared.",
    chat_too_long: "Please keep your question under 300 characters.",
    chat_offline: "You're offline, so I can only answer common questions right now.",
    ch_book: "How do I book?", ch_materials: "What do you collect?", ch_rates: "How are rates set?",
    ch_areas: "Which areas?", ch_prepare: "How to prepare?", ch_track: "Track my pickup",
    ch_business: "Business pickups", ch_hazard: "Hazardous items",
    go_book: "Book Pickup", go_rates: "Open rate board", go_coverage: "Check your area", go_toolkit: "Open toolkit",
    go_track: "Track pickup", go_business: "Business inquiry", go_contact: "Contact", go_categories: "See categories",
    go_faq: "Read FAQ", go_calc: "Open calculator", go_login: "Log in",
    no_date: "Not set",
    home: "Home",
    v_gmail: "Please use a Gmail address ending in @gmail.com.",
    v_pw_match: "Passwords do not match.",
    v_terms: "Please accept the terms and privacy notice.",
    gmail_only_err: "Only Gmail accounts (@gmail.com) can sign in to SafaCycle. Please use a Gmail address.",
    ae_disabled: "This account has been disabled. Please contact us.",
    ae_recent: "Please log in again to continue.",
    verify_sent: "We've sent a verification link to your Gmail inbox.",
    verify_ok: "Thank you! Your email is verified.",
    verify_not_yet: "Not verified yet. Open the link in your email, then try again.",
    verify_wait: "Please wait {s} seconds before resending.",
    synced: "Synced to your account",
    sync_saving: "Saving to your account…",
    sync_fail: "Not synced. Check your connection.",
    pw_hint: "Use at least 8 characters with letters and numbers.",
    pw_weak: "Weak password", pw_fair: "Fair password", pw_good: "Good password", pw_strong: "Strong password",
    show_pw: "Show password", hide_pw: "Hide password",
    act_business: "Business inquiry", act_community: "Community day", act_coverage: "Coverage request", act_contact: "Message",
    act_empty: "Nothing here yet. Forms you send while logged in will appear here.",
    act_error: "We couldn't load your other requests right now.",
  },

  ne: {
    lang_to_ne: "भाषा नेपालीमा बदल्नुहोस्",
    lang_to_en: "भाषा अंग्रेजीमा बदल्नुहोस्",
    skip: "मुख्य सामग्रीमा जानुहोस्",
    offline: "तपाईं अफलाइन हुनुहुन्छ। वेबसाइट हेर्न सकिन्छ, तर बुकिङ र फारम पठाउन इन्टरनेट चाहिन्छ।",
    announce_text: "अहिले भरतपुर र चितवनका नजिकका क्षेत्रबाट सेवा सुरु हुँदैछ। थप टोलहरू क्रमशः थपिनेछन्।",
    announce_cta: "आफ्नो क्षेत्र जाँच्नुहोस्",
    announce_short: "अहिले भरतपुर, चितवनमा सेवा",
    nav_rates: "दर", nav_calc: "क्याल्कुलेटर", nav_book: "बुक", nav_track: "ट्र्याक", nav_business: "व्यवसाय",
    nav_faq: "प्रश्नोत्तर", nav_contact: "सम्पर्क", nav_area: "क्षेत्र जाँच", nav_categories: "हामी के लैजान्छौं",
    nav_toolkit: "रिसाइक्लिङ टुलकिट",
    login: "लग इन", register: "दर्ता", reset_pw: "पासवर्ड रिसेट", logout: "लग आउट", account: "खाता", my_pickups: "मेरा पिकअप",
    book_pickup: "पिकअप बुक गर्नुहोस्", check_rates: "दर हेर्नुहोस्",
    hero_eyebrow: "घरदैलो कबाडी सेवा · भरतपुर, चितवन",
    hero_title: "भरतपुरको कबाडीलाई फोहोर होइन, आम्दानी बनाऔं।",
    hero_lead: "कागज, प्लास्टिक, धातु र पुराना इलेक्ट्रोनिक सामान घरमै छुट्याउनुहोस्। अनलाइन अनुमानित मूल्य हेर्नुहोस्, आफूलाई मिल्ने समय बुक गर्नुहोस्, र हाम्रो टोलीले तपाईंकै ढोकामा सबै तौलिन्छ।",
    hero_cta_book: "पिकअप बुक गर्नुहोस्", hero_cta_rates: "कबाडी दर हेर्नुहोस्",
    trust1_t: "घरदैलो पिकअप", trust1_d: "कबाडी पसलसम्म बोक्नु पर्दैन",
    trust2_t: "तपाईंकै अगाडि तौल", trust2_d: "हरेक तौल आफैं हेर्नुहोस्",
    trust3_t: "ट्र्याक गर्न मिल्ने अनुरोध", trust3_d: "स्थिति अनलाइन हेर्नुहोस्",
    hero_tag: "भरतपुरबाट सुरु",
    mini_title: "छिटो अनुमान", material: "सामग्री", quantity: "परिमाण", approx_value: "अनुमानित मूल्य",
    demo_note_short: "डेमो अनुमान। अन्तिम मूल्य तौलपछि तय हुन्छ।", mini_add: "पूरा क्याल्कुलेटरमा थप्नुहोस्",
    coverage_kicker: "सेवा क्षेत्र", coverage_title: "के हामी तपाईंको टोलमा आउँछौं?",
    coverage_lead: "आफ्नो क्षेत्र टाइप गर्नुहोस् वा छान्नुहोस्। यो सूची भरतपुर र नजिकका ठाउँका लागि हाम्रो सुरुवाती व्यवस्था हो। सेवा बढ्दै जाँदा यो बदलिन सक्छ, त्यसैले यो स्थायी वा ग्यारेन्टी गरिएको सेवा नक्सा होइन।",
    st_available: "उपलब्ध", st_available_d: "नियमित पिकअपको योजना",
    st_limited: "सीमित", st_limited_d: "केही दिन मात्र",
    st_request: "सेवा माग्नुहोस्", st_request_d: "आफ्नो चासो जनाउनुहोस्",
    area_label: "तपाईंको क्षेत्र वा टोल", area_ph: "जस्तै: हाकिम चोक", check_area: "उपलब्धता जाँच्नुहोस्",
    cov_req_title: "यो क्षेत्र थप्न अनुरोध गर्नुहोस्", f_name_opt: "तपाईंको नाम (ऐच्छिक)",
    f_phone_opt: "फोन (ऐच्छिक, जानकारीका लागि)", cov_req_btn: "सेवा अनुरोध पठाउनुहोस्",
    how_kicker: "कसरी काम गर्छ", how_title: "घरको एउटा कुनाबाट सफा चितवनसम्म, पाँच चरणमा",
    step1_t: "कबाडी छान्नुहोस्", step1_d: "कागज, प्लास्टिक, धातु, सिसा र इलेक्ट्रोनिक्स छुट्टाछुट्टै झोला वा बिटामा राख्नुहोस्।",
    step2_t: "मूल्य अनुमान गर्नुहोस्", step2_d: "बुक गर्नुअघि क्याल्कुलेटरमा अनुमानित मूल्य हेर्नुहोस्।",
    step3_t: "ठाउँ र समय छान्नुहोस्", step3_d: "आफ्नो टोल, वडा र मिल्ने समय बताउनुहोस्।",
    step4_t: "स्पष्ट तौल", step4_d: "तपाईंकै ढोकामा, तपाईंले देख्ने गरी तौलिन्छ।",
    step5_t: "पुष्टि र भुक्तानी", step5_d: "अन्तिम रकममा सहमति गर्नुहोस्, भुक्तानी लिनुहोस् र खातामा रेकर्ड हेर्नुहोस्।",
    how_fig: "पारदर्शी तौल हाम्रो योजनाबद्ध सेवा मापदण्डको हिस्सा हो।",
    cat_kicker: "हामी के लैजान्छौं", cat_title: "कबाडीका प्रकार",
    cat_lead: "प्रमाणित स्थानीय दर प्रकाशित नभएसम्म तलका मूल्य डेमो अनुमानित दर हुन्। योजना बनाउन मात्र हुन्, मूल्यको प्रस्ताव होइनन्।",
    examples: "उदाहरण:", add_calc: "क्याल्कुलेटरमा थप्नुहोस्", unit_pc_kg: "थान / केजी", unit_pc: "थान",
    cat_paper: "कागज र कार्टुन", cat_paper_d: "सुक्खा कागज र चेप्टो पारिएका बाकस सजिलै रिसाइकल हुन्छन्।", cat_paper_eg: "पत्रिका, कापी, किताब, कार्टुन",
    cat_plastic: "प्लास्टिक", cat_plastic_d: "सफा, सुक्खा र छुट्याइएको प्लास्टिकको मूल्य राम्रो हुन्छ।", cat_plastic_eg: "बोतल, जार, बाल्टिन, क्रेट",
    cat_iron: "फलाम र स्टिल", cat_iron_d: "छड देखि पुराना भाँडासम्म, घर र वर्कसपका धातु।", cat_iron_eg: "छड, पाता, टिन, स्टिलका भाँडा",
    cat_aluminium: "एल्मुनियम", cat_aluminium_d: "हल्का धातु, जुन पटक पटक रिसाइकल गर्न सकिन्छ।", cat_aluminium_eg: "क्यान, भाँडा, झ्यालका फ्रेम",
    cat_copper: "तामा र पित्तल", cat_copper_d: "बढी मूल्यका धातु। फलामबाट छुट्टै राख्नुहोस्।", cat_copper_eg: "तार, पाइप, पित्तलका धारा, भाँडा",
    cat_glass: "सिसा", cat_glass_d: "पूरा बोतल र जार। फुटेको सिसा सुरक्षित रूपमा बेर्नुहोस्।", cat_glass_eg: "बोतल, जार, सिसाका भाँडा",
    cat_ewaste: "इ-फोहोर", cat_ewaste_d: "पुराना इलेक्ट्रोनिक सामान, जिम्मेवार तरिकाले व्यवस्थापनका लागि।", cat_ewaste_eg: "मोबाइल, ल्यापटप, चार्जर, तार",
    cat_batteries: "ब्याट्री", cat_batteries_d: "नफुटेका ब्याट्री मात्र। फुलेका वा चुहिएका भए पहिले जानकारी दिनुहोस्।", cat_batteries_eg: "इन्भर्टर, गाडी र ड्राइसेल ब्याट्री",
    cat_appliances: "घरायसी उपकरण", cat_appliances_d: "नचल्ने वा नचाहिने ठूला सामान।", cat_appliances_eg: "फ्रिज, वासिङ मेसिन, कुलर, पंखा",
    cat_mixed: "मिश्रित घरायसी कबाडी", cat_mixed_d: "कसरी छुट्याउने थाहा छैन? पिकअपका बेला हामी सँगै छुट्याउँछौं।", cat_mixed_eg: "सरसफाइबाट निस्केका मिश्रित सुक्खा कबाडी",
    rates_kicker: "दर बोर्ड", rates_title: "भरतपुरमा कबाडीको अनुमानित दर",
    rate_demo_badge: "डेमो अनुमानित दर", rate_live_badge: "प्रकाशित अनुमानित दर", last_updated: "अन्तिम अपडेट:",
    search_material: "सामग्री खोज्नुहोस्", search_ph: "खोज्नुहोस्, जस्तै: तामा, बोतल", sort_by: "क्रमबद्ध",
    sort_name: "नाम (क–ज्ञ)", sort_high: "दर: बढी देखि कम", sort_low: "दर: कम देखि बढी",
    rate_empty: "खोजसँग मिल्ने सामग्री भेटिएन। \"प्लास्टिक\" वा \"फलाम\" जस्ता सजिला शब्द प्रयोग गर्नुहोस्, वा मिश्रित घरायसी कबाडी छान्नुहोस्।",
    rate_disclaimer: "सबै दर नेपाली रुपैयाँमा अनुमान मात्र हुन्। स्थानीय बजार, गुणस्तर, चिस्यान र छुट्याइएको अवस्था अनुसार दर फरक पर्न सक्छ। \"डेमो\" लेखिएका दर योजनाका लागि नमूना मात्र हुन्। अन्तिम मूल्य पिकअपमा जाँच र तौलपछि तय हुन्छ।",
    calc_kicker: "कबाडी क्याल्कुलेटर", calc_title: "तपाईंको कबाडीको मूल्य कति होला?",
    calc_lead: "हरेक सामग्री र त्यसको अनुमानित तौल वा थान थप्नुहोस्। तपाईंले मूल्यको दायरा देख्नुहुनेछ, र यो सूची सिधै बुकिङमा पठाउन सक्नुहुन्छ।",
    calc_notice: "संकलन टोलीले सामग्री जाँचेर र तौलेर मात्र अन्तिम मूल्य पक्का गर्छ। अनुमान मूल्यको ग्यारेन्टी होइन।",
    calc_empty: "अहिलेसम्म कुनै सामग्री छैन। सुरु गर्न एउटा पङ्क्ति थप्नुहोस्।",
    add_row: "सामग्री थप्नुहोस्", reset: "रिसेट", total_weight: "अनुमानित तौल", total_value: "अनुमानित मूल्य",
    calc_to_book: "यो सूची मेरो बुकिङमा राख्नुहोस्",
    book_kicker: "स्मार्ट पिकअप बुकिङ", book_title: "घरदैलो पिकअपको अनुरोध गर्नुहोस्",
    book_lead: "करिब दुई मिनेट लाग्छ। अतिथिको रूपमा बुक गर्न सक्नुहुन्छ, वा लग इन गरेर \"मेरा पिकअप\" बाट अनुरोध हेर्न सक्नुहुन्छ।",
    bstep1: "विवरण", bstep2: "ठेगाना", bstep3: "कबाडी", bstep4: "समय", bstep5: "पुनरावलोकन",
    bstep1_title: "तपाईंको सम्पर्क विवरण", bstep2_title: "पिकअप गर्ने ठाउँ", bstep3_title: "हामीले के लैजाने?",
    bstep4_title: "हामी कहिले आउने?", bstep5_title: "जाँच्नुहोस् र पुष्टि गर्नुहोस्",
    f_name: "पूरा नाम", f_email: "इमेल", f_email_opt: "इमेल (ऐच्छिक)", f_phone: "फोन नम्बर (नेपाल)",
    f_phone_hint: "मोबाइल वा ल्यान्डलाइन। +977 राख्नु अनिवार्य छैन।", f_phone_opt2: "फोन (ऐच्छिक)",
    f_contact: "सम्पर्कको माध्यम", c_call: "फोन कल", c_sms: "एसएमएस", c_whatsapp: "ह्वाट्सएप / भाइबर", c_email: "इमेल",
    f_area: "क्षेत्र / टोल", f_ward: "वडा नम्बर", f_ward_hint: "भरतपुर महानगरपालिकामा वडा १–२९ छन्।",
    f_landmark: "नजिकको चिनारी", f_landmark_ph: "जस्तै: विद्यालयको गेट अगाडि", f_map: "नक्सा लिंक (ऐच्छिक)",
    f_address: "पूरा ठेगाना / बाटो", from_calc: "तपाईंको क्याल्कुलेटरबाट", remove: "हटाउनुहोस्",
    f_materials: "सामग्रीका प्रकार", f_weight: "अनुमानित जम्मा तौल (केजी)", f_qty: "सामान / झोलाको संख्या (ऐच्छिक)",
    f_photo: "फोटोको लिंक (ऐच्छिक)", f_photo_ph: "Google Drive / Photos को सेयर लिंक",
    f_photo_hint: "ठूलो परिमाणका लागि उपयोगी। सुरक्षित स्टोरेज सुरु भएपछि फोटो अपलोड थपिनेछ।",
    f_notes: "संकलन टोलीका लागि टिप्पणी (ऐच्छिक)", f_notes_ph: "जस्तै: सामान छतमा छ, गेट छेउको गल्लीमा छ",
    hazard_short: "रसायन, स्वास्थ्य संस्थाको फोहोर, ग्यास सिलिन्डर वा चुहिएका ब्याट्री नराख्नुहोस्। टुलकिटमा रहेको खतरनाक सामग्रीसम्बन्धी सूचना हेर्नुहोस्।",
    f_date: "मनपर्ने मिति", f_time: "मनपर्ने समय", choose: "छान्नुहोस्…", f_urgency: "कति छिटो?",
    u_flexible: "लचिलो — यो हप्ताभित्र जुनसुकै दिन", u_standard: "सामान्य — छानिएको मितिमा", u_priority: "प्राथमिकता — चाँडै सर्दै वा खाली गर्दै",
    f_alt: "वैकल्पिक समय (ऐच्छिक)", f_alt_ph: "जस्तै: शनिबार बिहान", f_recurring: "यो पिकअप दोहोर्याउने?",
    r_none: "होइन, एक पटक मात्र", r_weekly: "हरेक हप्ता", r_biweekly: "हरेक दुई हप्ता", r_monthly: "हरेक महिना", r_once: "एक पटकको सरसफाइ",
    consent: "यो पिकअप मिलाउन SafaCycle Chitwan ले यी विवरण प्रयोग गर्न सक्छ भन्नेमा म सहमत छु, जस्तो कि", privacy_notice: "गोपनीयता सूचना",
    back: "पछाडि", next: "अगाडि बढ्नुहोस्", submit_request: "अनुरोध पठाउनुहोस्",
    track_kicker: "पिकअप ट्र्याकिङ", track_title: "मेरो पिकअप कहाँ पुग्यो?",
    track_lead: "ट्र्याकिङ कोड र बुकिङमा प्रयोग गरिएको फोन नम्बरका अन्तिम ४ अंक राख्नुहोस्। तपाईंको गोपनीयताका लागि यहाँ स्थिति मात्र देखिन्छ, ठेगाना वा सम्पर्क विवरण कहिल्यै देखिँदैन।",
    track_code: "ट्र्याकिङ कोड", track_phone: "फोनका अन्तिम ४ अंक", track_btn: "पिकअप ट्र्याक गर्नुहोस्",
    track_placeholder: "तपाईंको पिकअपको समयरेखा यहाँ देखिनेछ।",
    dash_kicker: "मेरो खाता", my_impact: "मेरो रिसाइक्लिङ योगदान", completed_pickups: "पूरा भएका पिकअप",
    kg_diverted: "ल्यान्डफिलबाट जोगाइएको केजी", my_impact_note: "तपाईंका पूरा भएका पिकअपमा रेकर्ड गरिएको तौलका आधारमा मात्र।",
    prefs_title: "पिकअप प्राथमिकता", f_recurring_pref: "नियमित पिकअपको चाहना", save: "सेभ गर्नुहोस्",
    biz_kicker: "घर र संस्थाका लागि", biz_title: "भरतपुरभर रिसाइक्लिङ सेवा",
    biz_lead: "एउटा घरदेखि व्यस्त होटलको भान्सासम्म, तपाईंलाई चाहिने पिकअप छान्नुहोस्।",
    svc1_t: "घरायसी पिकअप", svc1_d: "कागज, बोतल, धातु र पुराना ग्याजेट घरबाटै लैजाने।",
    svc2_t: "कार्यालय रिसाइक्लिङ", svc2_d: "फाइल, कार्टुन र पुराना IT उपकरण तालिका अनुसार संकलन।",
    svc3_t: "विद्यालय र कलेज", svc3_d: "सत्रको अन्त्यमा कागज संकलन र विद्यार्थी सचेतना अभियान।",
    svc4_t: "होटल र रेस्टुरेन्ट", svc4_d: "कार्टुन, क्यान, बोतल र भान्साका धातुको नियमित संकलन।",
    svc5_t: "पसल र गोदाम सफाइ", svc5_d: "प्याकेजिङ फोहोर र पुराना र्याक एकै पटकमा खाली।",
    svc6_t: "कार्यक्रमको फोहोर संकलन", svc6_d: "विवाह र कार्यक्रमका लागि छुट्टै बिन र पछि पिकअप।",
    svc7_t: "इ-फोहोर संकलन", svc7_d: "मोबाइल, कम्प्युटर र तार जिम्मेवार व्यवस्थापनका लागि।",
    svc8_t: "नियमित व्यावसायिक योजना", svc8_d: "हप्तैपिच्छे, दुई हप्तामा वा मासिक तोकिएको पिकअप।",
    biz_form_title: "व्यावसायिक पिकअप सोधपुछ",
    biz_form_lead: "तपाईंको संस्थाको कबाडीबारे बताउनुहोस्, हामी उपयुक्त पिकअप योजना सुझाउँछौं। यसले अहिले बुकिङ बनाउँदैन।",
    f_org: "संस्थाको नाम", f_orgtype: "संस्थाको प्रकार", ot_office: "कार्यालय", ot_school: "विद्यालय / कलेज",
    ot_hotel: "होटल / रेस्टुरेन्ट", ot_shop: "पसल / गोदाम", ot_workshop: "वर्कसप / ग्यारेज",
    ot_hospital: "क्लिनिक / अस्पताल (स्वास्थ्यजन्य फोहोर बाहेक)", ot_event: "कार्यक्रम आयोजक", ot_other: "अन्य",
    f_person: "सम्पर्क व्यक्ति", f_volume: "मासिक अनुमानित परिमाण", v1: "५० केजीभन्दा कम", v2: "५० – २०० केजी",
    v3: "२०० – ५०० केजी", v4: "५०० केजीभन्दा बढी", v5: "अहिले थाहा छैन", f_frequency: "पिकअप कति पटक",
    f_biz_materials: "मुख्य सामग्री र अन्य टिप्पणी", f_biz_ph: "जस्तै: डेलिभरीका कार्टुन, पुराना कम्प्युटर, भान्साका टिन", send_inquiry: "सोधपुछ पठाउनुहोस्",
    tool_kicker: "रिसाइक्लिङ टुलकिट", tool_title: "पिकअप सजिलो बनाउने उपयोगी साधन",
    hazard_title: "खतरनाक सामग्रीलाई विशेष व्यवस्थापन चाहिन्छ",
    hazard_body: "सामान्य पिकअपमा थाहा नभएका रसायन, कीटनाशक, पेन्ट थिनर, स्वास्थ्य संस्थाको फोहोर वा सुई, ग्यास सिलिन्डर तथा दबाबयुक्त भाँडा, र फुलेका, बिग्रिएका वा चुहिएका ब्याट्री लगिँदैन। यस्ता सामान नखोल्नुहोस्, नप्वाल्नुहोस्, नजलाउनुहोस् र नपोख्नुहोस्। बालबालिकाबाट टाढा, चिसो र हावा चल्ने ठाउँमा राख्नुहोस्, र स्थानीय नगरपालिका वा योग्य खतरनाक फोहोर व्यवस्थापन सेवालाई सम्पर्क गर्नुहोस्। आगलागी, ग्यास चुहावट वा रसायन पोखिएमा तुरुन्तै आपतकालीन सेवामा फोन गर्नुहोस्।",
    tab_prep: "तयारी निर्देशिका", tab_impact: "प्रभाव अनुमान", tab_reminder: "रिसाइकल रिमाइन्डर", tab_community: "सामुदायिक दिन", tab_receipt: "नमूना रसिद",
    prep1_t: "छुट्याउनुहोस्", prep1_1: "कागज, प्लास्टिक, सिसा र हरेक किसिमको धातु छुट्टाछुट्टै झोलामा राख्नुहोस्।",
    prep1_2: "तामा र पित्तल फलामबाट अलग राख्नुहोस्। छुट्टै राख्दा बढी मूल्य पाइन्छ।", prep1_3: "बोतल र टिन खाली गरेर पखाल्नुहोस्, अनि सुकाउनुहोस्।",
    prep2_t: "प्याक गर्नुहोस्", prep2_1: "बाकस चेप्टो पार्नुहोस् र कागजको बिटा बाँध्नुहोस्।",
    prep2_2: "फुटेको सिसा बाक्लो कागजमा बेरेर लेबल लगाउनुहोस्।", prep2_3: "सबै सुक्खा राख्नुहोस्। भिजेको कागज गह्रौं हुन्छ तर मूल्य कम हुन्छ।",
    prep3_t: "नराख्नुहोस्", prep3_1: "खानाको फोहोर, भिजेका वा तेलयुक्त प्याकेट र डायपर।",
    prep3_2: "स्वास्थ्य संस्थाको फोहोर, सिरिन्ज र औषधि।", prep3_3: "रसायन, ग्यास सिलिन्डर र चुहिएका ब्याट्री (माथिको चेतावनी हेर्नुहोस्)।",
    prep4_t: "डिभाइस सफा गर्नुहोस्", prep4_1: "फोटो र फाइल ब्याकअप गर्नुहोस्, अनि Google, Apple र अन्य खाताबाट साइन आउट गर्नुहोस्।",
    prep4_2: "सिम कार्ड र मेमोरी कार्ड निकाल्नुहोस्।", prep4_3: "फ्याक्ट्री रिसेट गर्नुहोस्। कम्प्युटरको हार्ड ड्राइभ वा SSD निकालेर आफैं राख्न सक्नुहुन्छ।",
    impact_intro: "तपाईंले रिसाइकल गर्ने तौल राख्नुहोस्। हामी ल्यान्डफिलबाट जोगिने तौल मात्र देखाउँछौं। दस्तावेजीकृत विधि बिना कार्बन वा ऊर्जाको तथ्यांक देखाउँदैनौं।",
    imp_kg: "प्रति पिकअप तौल (केजी)", imp_freq: "कति पटक?", imp_out: "एक वर्षमा ल्यान्डफिलबाट जोगिने अनुमानित तौल",
    imp_method: "विधि: प्रति पिकअप तौल × वर्षभरिका पिकअप संख्या। संकलित सामग्री उद्देश्य अनुसार रिसाइकल हुन्छ भन्ने मानिएको छ।",
    rem_freq: "मलाई सम्झाउनुहोस्", rem_day: "मनपर्ने दिन", d_sat: "शनिबार", d_sun: "आइतबार", d_mon: "सोमबार", d_tue: "मंगलबार",
    d_wed: "बुधबार", d_thu: "बिहीबार", d_fri: "शुक्रबार", d_weekday: "कुनै पनि कार्यदिन",
    rem_save: "रिमाइन्डर सेभ गर्नुहोस्", rem_clear: "बन्द गर्नुहोस्",
    rem_disclose: "तपाईंको रिमाइन्डर यो ब्राउजरमा मात्र सेभ हुन्छ। तोकिएको दिन वा त्यसपछि यो साइट खोल्दा देखिन्छ। ब्राउजर नोटिफिकेसन अनुमति दिनुभएमा मात्र पप-अप आउँछ, र केही फोनले यसलाई सीमित गर्न सक्छन्।",
    comm_title: "आफ्नो टोलमा संकलन दिन ल्याउनुहोस्",
    comm_lead: "एउटै क्षेत्रका पर्याप्त छिमेकीले चासो देखाएमा हामी साझा संकलन दिनको योजना बनाउन सक्छौं। यसले यात्रा घटाउँछ र सडक सफा राख्छ। चासो दर्ता गर्नु बुकिङ होइन।",
    comm_btn: "चासो दर्ता गर्नुहोस्",
    rcpt_title: "तपाईंको डिजिटल रसिद यस्तो देखिनेछ",
    rcpt_lead: "पिकअप पूरा भएपछि टोलीले अन्तिम तौल रेकर्ड गरेपछि लग इन गरेका ग्राहकले \"मेरा पिकअप\" मा रसिद देख्नुहुनेछ। यहाँको उदाहरण काल्पनिक अंकसहितको नमूना मात्र हो।",
    sample: "नमूना · वास्तविक कारोबार होइन", weight: "तौल", amount: "रकम", total: "जम्मा",
    rm_newspaper: "पत्रिका", rm_pet: "प्लास्टिक बोतल", rm_iron: "फलाम (मिश्रित)",
    rcpt_foot: "ढोकामै तौलिएको · अंकहरू उदाहरण मात्र",
    why_kicker: "किन SafaCycle", why_title: "भरतपुरका लागि बनाइएको, विश्वास गर्न सकिने गरी",
    why_lead: "\"योजनाबद्ध मापदण्ड\" लेखिएका कुराले सेवा सुरु हुँदा हामी कसरी काम गर्ने योजना गर्दैछौं भन्ने देखाउँछन्।",
    planned: "योजनाबद्ध मापदण्ड",
    why1_t: "भरतपुर पहिलो", why1_d: "सबैतिर पुग्ने वाचा गर्नुको सट्टा घरनजिकैबाट सुरु गरी टोल-टोल गर्दै बढ्छौं।",
    why2_t: "पारदर्शी अनुमानित दर", why2_d: "बुक गर्नुअघि नै दर प्रकाशित हुन्छ र अनुमान भनेर स्पष्ट लेखिन्छ।",
    why3_t: "स्पष्ट डिजिटल ट्र्याकिङ", why3_d: "हरेक अनुरोधको कोड हुन्छ, जसबाट अनलाइन स्थिति हेर्न सकिन्छ।",
    why4_t: "सजिलो घरदैलो पिकअप", why4_d: "समय छान्नुहोस्, हामी तपाईंकहाँ आउँछौं।",
    why5_t: "जिम्मेवार छुट्याइ", why5_d: "सामग्री छुट्याएर रिसाइकल गर्नेलाई दिइन्छ, फालिँदैन।",
    why6_t: "घर र व्यवसाय दुवै", why6_d: "परिवारका लागि एक पटकको पिकअप, संस्थाका लागि तालिकाबद्ध योजना।",
    why7_t: "स्थानीय भाषामा सहयोग", why7_d: "साइट अंग्रेजी वा नेपालीमा चलाउनुहोस्, र नेपालीमै सहयोग पाउनुहोस्।",
    why8_t: "गोपनीयताप्रति सचेत खाता", why8_d: "तपाईंले आफ्नै अनुरोध मात्र देख्नुहुन्छ, र सार्वजनिक ट्र्याकिङमा व्यक्तिगत विवरण कहिल्यै देखिँदैन।",
    impact_kicker: "सामुदायिक प्रभाव", impact_title: "सफा गल्ली छुट्याइएको कबाडीबाट सुरु हुन्छ",
    impact_lead: "रिसाइकल हुने सामान जलाउन वा फाल्नुको सट्टा संकलन गर्दा ढल सफा रहन्छ, सडक सफा देखिन्छ र उपयोगी सामग्री फेरि उत्पादनमा पुग्छ। पिकअप सुरु भएपछि हामी वास्तविक तथ्यांक यहाँ प्रकाशित गर्नेछौं।",
    cnt_pickups: "पूरा भएका पिकअप", cnt_kg: "संकलित केजी", cnt_areas: "सेवा पुगेका क्षेत्र", cnt_community: "सामुदायिक संकलन दिन",
    launching: "छिट्टै सुरु हुँदैछ",
    gal_kicker: "ग्यालरी", gal_title: "हाम्रो क्षेत्रमा रिसाइक्लिङ",
    gal_lead: "हामी गर्ने कामको प्रकार देखाउने खुला इजाजतपत्रका फोटो। यी SafaCycle को कामका फोटो होइनन्।", image_credits: "फोटो श्रेय",
    g1: "पुनः प्रयोग हुने सामग्री छुट्याउँदै", g2: "कागज र कार्टुन संकलन", g3: "धातु रिसाइक्लिङ यार्ड", g4: "प्लास्टिक र सिसा छुट्याउँदै",
    g5: "भरतपुर र नारायणी उपत्यका", g6: "इ-फोहोर संकलन अभियान", g7: "दक्षिण एसियामा टोलको कबाडी व्यापार", g8: "कार्गो साइकलबाट संकलन",
    faq_kicker: "प्रश्नोत्तर", faq_title: "भरतपुरका मानिसहरूले सोध्ने प्रश्न",
    faq_lead: "जवाफ भेटिएन? फोहोर विशेषज्ञलाई सोध्नुहोस् वा हामीलाई सन्देश पठाउनुहोस्।", ask_assistant: "Safa Assistant लाई सोध्नुहोस्",
    faq1_q: "कुन कुन सामग्री लगिन्छ?", faq1_a: "हामी कागज र कार्टुन, प्लास्टिक, फलाम र स्टिल, एल्मुनियम, तामा र पित्तल, सिसा, इ-फोहोर, ब्याट्री, पुराना उपकरण र मिश्रित घरायसी कबाडी संकलन गर्ने योजनामा छौं। उदाहरणका लागि कबाडीका प्रकार खण्ड हेर्नुहोस्। खतरनाक सामग्री सामान्य पिकअपमा लगिँदैन।",
    faq2_q: "के चितवनभर पिकअप उपलब्ध छ?", faq2_a: "अहिले छैन। सेवा भरतपुर र नजिकका क्षेत्रबाट सुरु हुँदैछ। आफ्नो ठाउँ उपलब्ध, सीमित वा सेवा माग्न मिल्ने के हो भनेर क्षेत्र जाँचक प्रयोग गर्नुहोस्।",
    faq3_q: "न्यूनतम परिमाण छ?", faq3_a: "सुरुवाती योजनामा तोकिएको न्यूनतम छैन, तर धेरै थोरै सामान भए तपाईंको क्षेत्रका अन्य पिकअपसँग मिलाइन सक्छ। पुष्टि गर्नुअघि टोलीले जानकारी दिन्छ।",
    faq4_q: "दर कसरी निकालिन्छ?", faq4_a: "हरेक सामग्रीको प्रति केजी वा प्रति थान अनुमानित दर हुन्छ। तौल वा थानलाई दरले गुणन गर्दा अनुमान आउँछ। वास्तविक रकम सामग्रीको गुणस्तर, छुट्याइ र स्थानीय बजार मूल्यमा भर पर्छ।",
    faq5_q: "अनलाइन दर अन्तिम हो?", faq5_a: "होइन। अनलाइन दर अनुमान मात्र हो। पिकअपमा जाँच र तौलपछि संकलन टोलीले अन्तिम मूल्य पक्का गर्छ।",
    faq6_q: "कबाडी कसरी तौलिन्छ?", faq6_a: "पिकअपका बेला तपाईंकै अगाडि तौलिन्छ, र तौल तपाईं आफैं हेर्न सक्नुहुन्छ। हामी डिजिटल तराजु प्रयोग गर्ने र तौल तपाईंको पिकअप रेकर्डमा राख्ने योजनामा छौं।",
    faq7_q: "पिकअप कहिले हुन्छ?", faq7_a: "बुक गर्दा तपाईं मनपर्ने मिति र समय छान्नुहुन्छ। त्यसपछि क्षेत्रमा संकलकको उपलब्धता हेरेर टोलीले वास्तविक समय पक्का गर्न सम्पर्क गर्छ।",
    faq8_q: "कार्यालयले नियमित पिकअप मिलाउन सक्छ?", faq8_a: "सक्छ। कार्यालय, विद्यालय, पसल र होटलले व्यावसायिक सोधपुछ फारमबाट हप्तैपिच्छे, दुई हप्तामा वा मासिक पिकअप माग्न सक्छन्।",
    faq9_q: "इलेक्ट्रोनिक सामान लगिन्छ?", faq9_a: "लगिन्छ। मोबाइल, चार्जर, कम्प्युटर, तार र साना उपकरण जस्ता सामान्य इ-फोहोरका लागि अनुरोध गर्न सकिन्छ। बिग्रिएका, फुलेका वा चुहिएका ब्याट्रीलाई विशेष व्यवस्थापन चाहिन्छ, त्यसैले पहिले नै जानकारी दिनुहोस्।",
    faq10_q: "मोबाइल र कम्प्युटर कसरी तयार गर्ने?", faq10_a: "डाटा ब्याकअप गर्नुहोस्, सबै खाताबाट साइन आउट गर्नुहोस्, सिम र मेमोरी कार्ड निकाल्नुहोस्, र फ्याक्ट्री रिसेट गर्नुहोस्। आफैं राख्न वा नष्ट गर्न चाहनुहुन्छ भने कम्प्युटरको स्टोरेज ड्राइभ निकाल्नुहोस्।",
    faq11_q: "बुकिङ रद्द गर्न मिल्छ?", faq11_a: "मिल्छ। लग इन गरेका ग्राहकले अनुरोध \"अनुरोध गरिएको\" वा \"पुष्टि भएको\" अवस्थामा हुँदासम्म \"मेरा पिकअप\" बाट रद्द गर्न सक्नुहुन्छ। अतिथिले सम्पर्क खण्ड प्रयोग गर्न सक्नुहुन्छ।",
    faq12_q: "ग्राहकको जानकारी कसरी सुरक्षित राखिन्छ?", faq12_a: "तपाईंको विवरण पिकअप मिलाउन मात्र प्रयोग हुन्छ। लग इन गरेका ग्राहकले आफ्नै अनुरोध मात्र देख्छन्, र सार्वजनिक ट्र्याकिङमा स्थिति मात्र देखिन्छ, ठेगाना वा फोन नम्बर कहिल्यै देखिँदैन।",
    contact_kicker: "सम्पर्क", contact_title: "SafaCycle टोलीसँग कुरा गर्नुहोस्", contact_lead: "भरतपुर, चितवन र नजिकका क्षेत्रमा सेवा।",
    phone: "फोन", email: "इमेल", hours: "सेवा समय", service_area: "सेवा क्षेत्र",
    service_area_val: "भरतपुर महानगरपालिका र नजिकका क्षेत्र, चितवन, नेपाल", add_official: "आधिकारिक विवरण थप्नुहोस्",
    map_ph: "नक्सामा स्थान:", view_map: "OpenStreetMap मा भरतपुर हेर्नुहोस्", social: "सामाजिक सञ्जाल:",
    contact_form_title: "सन्देश पठाउनुहोस्", f_topic: "विषय", tp_general: "सामान्य प्रश्न", tp_booking: "बुकिङबारे",
    tp_cancel: "अतिथि बुकिङ रद्द गर्न", tp_rates: "दर", tp_feedback: "सुझाव", f_message: "सन्देश",
    contact_need: "जवाफ दिन सकियोस् भनेर इमेल वा फोन दिनुहोस्।", send_message: "सन्देश पठाउनुहोस्",
    cta_title: "भण्डारमा थुप्रिएको कबाडी भोलि कसैको कच्चा पदार्थ बन्न सक्छ।",
    cta_lead: "आजै भरतपुरमा पिकअप बुक गर्नुहोस्, वा पहिले तपाईंको कबाडीको मूल्य कति होला हेर्नुहोस्।",
    biz_inquiry_btn: "व्यावसायिक सोधपुछ",
    footer_about: "भरतपुर, चितवनबाट सुरु हुँदै गरेको घरदैलो कबाडी संकलन तथा रिसाइक्लिङ सेवा, घर, पसल, कार्यालय र संस्थाका लागि।",
    ft_links: "छिटो लिंक", ft_services: "सेवाहरू", ft_areas: "सेवा क्षेत्र", ft_areas_note: "सुरुवाती व्यवस्था। परिवर्तन हुन सक्छ।",
    ft_contact: "सम्पर्क", privacy: "गोपनीयता सूचना", terms: "प्रयोगका सर्त",
    ft_disclaimer: "देखाइएका दर अनुमान हुन्, मूल्यको प्रस्ताव होइनन्। SafaCycle Chitwan एउटा स्वतन्त्र स्थानीय पहल हो र अन्य कुनै कबाडी वा रिसाइक्लिङ ब्रान्डसँग आबद्ध छैन।",
    chat_sub: "स्वचालित सहायक · मानिस होइन", chat_clear: "च्याट मेटाउनुहोस्", chat_label: "तपाईंको प्रश्न",
    chat_ph: "पिकअप, दर, क्षेत्रबारे सोध्नुहोस्…", chat_privacy: "यहाँ फोन नम्बर, ठेगाना वा पासवर्ड नलेख्नुहोस्।",
    auth_title: "तपाईंको SafaCycle खाता", f_password: "पासवर्ड", f_password_new: "पासवर्ड (८+ वर्ण, अक्षर र अंक)",
    create_account: "खाता बनाउनुहोस्", reset_lead: "नयाँ पासवर्ड राख्ने लिंक हामी इमेलमा पठाउँछौं।", send_reset: "रिसेट लिंक पठाउनुहोस्",
    or: "वा", google: "Google बाट जारी राख्नुहोस्",
    confirm_title: "पिकअप अनुरोध प्राप्त भयो", confirm_lead: "आफ्नो ट्र्याकिङ कोड सुरक्षित राख्नुहोस्। समय पक्का गर्न टोलीले सम्पर्क गर्नेछ।",
    copy: "कपी", confirm_track_note: "ट्र्याक गर्न यो कोड र तपाईंको फोन नम्बरका अन्तिम ४ अंक प्रयोग गर्नुहोस्।", done: "ठीक छ",
    request_details: "अनुरोधको विवरण",

    fb_unavailable: "अनलाइन सुविधा केही समयका लागि उपलब्ध छैनन्। दर हेर्न, क्याल्कुलेटर चलाउन र निर्देशिका पढ्न भने सकिन्छ।",
    err_permission: "सर्भरको सुरक्षा सेटिङले यो काम रोक्यो। पछि फेरि प्रयास गर्नुहोस् वा सम्पर्क खण्ड प्रयोग गर्नुहोस्।",
    err_offline: "तपाईं अफलाइन हुनुहुन्छ जस्तो छ। इन्टरनेट जोडेर फेरि प्रयास गर्नुहोस्।",
    err_fb: "अनलाइन सेवा अहिले उपलब्ध छैन। पछि फेरि प्रयास गर्नुहोस्।",
    err_timeout: "सर्भरले जवाफ दिन धेरै समय लियो। इन्टरनेट जाँचेर फेरि प्रयास गर्नुहोस्।",
    err_generic: "केही गडबड भयो। फेरि प्रयास गर्नुहोस्।",
    v_required: "यो भर्नु अनिवार्य छ।", v_email: "सही इमेल ठेगाना लेख्नुहोस्।",
    v_phone: "सही नेपाली फोन नम्बर लेख्नुहोस्, जस्तै 98XXXXXXXX वा 056-XXXXXX।", v_url: "https:// बाट सुरु हुने पूरा लिंक लेख्नुहोस्।",
    v_ward: "१ देखि ३५ सम्मको वडा नम्बर लेख्नुहोस्।", v_date: "आजको वा पछिको मिति छान्नुहोस्।", v_number: "सही संख्या लेख्नुहोस् (० वा बढी)।",
    v_code: "ट्र्याकिङ कोड SC-AB12-CD34 जस्तो हुन्छ।", v_last4: "ठ्याक्कै ४ अंक लेख्नुहोस्।", v_password: "अक्षर र अंकसहित कम्तीमा ८ वर्ण प्रयोग गर्नुहोस्।",
    v_minlen: "कम्तीमा {n} अक्षर लेख्नुहोस्।", v_materials: "कम्तीमा एउटा सामग्रीको प्रकार छान्नुहोस्।", v_consent: "अगाडि बढ्न गोपनीयता सूचना स्वीकार गर्नुहोस्।",
    v_contact_need: "जवाफ दिन सकियोस् भनेर इमेल वा फोन नम्बर थप्नुहोस्।", v_fix: "रातो देखाइएका ठाउँ सच्याउनुहोस्।",
    step_of: "चरण {n} / {total}", added_calc: "{name} क्याल्कुलेटरमा थपियो।", view_calc: "हेर्नुहोस्",
    calc_need_items: "पहिले तौल वा थानसहित कम्तीमा एउटा सामग्री थप्नुहोस्।", calc_sent: "तपाईंको क्याल्कुलेटर सूची बुकिङ फारममा थपियो।",
    rate_flag_demo: "डेमो", rate_flag_est: "अनुमान", rates_count: "{n} सामग्री देखाइएको", demo_est: "डेमो अनुमानित दर", est_rate: "अनुमानित दर",
    varies: "सामान अनुसार फरक", all: "सबै", per_kg: "/केजी", per_pc: "/थान", unit_kg: "केजी", unit_pc: "थान",
    estimate: "अनुमान", remove_row: "{name} हटाउनुहोस्", add: "थप्नुहोस्",
    cov_available: "उपलब्ध", cov_available_d: "{area} मा नियमित पिकअपको योजना छ। अहिले नै बुक गर्न सक्नुहुन्छ।",
    cov_limited: "सीमित", cov_limited_d: "{area} मा केही तोकिएका दिनमा मात्र पिकअप हुन्छ। बुक गर्नुहोस्, टोलीले नजिकको मिति पक्का गर्छ।",
    cov_none: "सेवा माग्नुहोस्", cov_none_d: "{area} अहिले हाम्रो सुरुवाती सूचीमा छैन। अनुरोध छोड्नुहोस्, नयाँ रुट बनाउँदा हामी यसलाई गन्छौं।",
    cov_sent: "धन्यवाद! {area} का लागि तपाईंको सेवा अनुरोध दर्ता भयो।", cov_already: "यो सत्रमा तपाईंले यो क्षेत्र पहिले नै माग्नुभएको छ।",
    book_now: "पिकअप बुक गर्नुहोस्",
    guest_hint: "अतिथिको रूपमा बुक गर्दै हुनुहुन्छ। यो अनुरोध \"मेरा पिकअप\" मा देखाउन चाहनुहुन्छ भने लग इन गर्नुहोस्।",
    user_hint: "{name} को रूपमा लग इन। यो अनुरोध \"मेरा पिकअप\" मा देखिनेछ।",
    booking_success: "पिकअप अनुरोध पठाइयो।",
    rv_name: "नाम", rv_email: "इमेल", rv_phone: "फोन", rv_contact: "सम्पर्क माध्यम", rv_location: "स्थान", rv_landmark: "चिनारी",
    rv_address: "ठेगाना", rv_map: "नक्सा लिंक", rv_materials: "सामग्री", rv_items: "क्याल्कुलेटरका सामान", rv_weight: "अनुमानित तौल",
    rv_qty: "सामान / झोला", rv_value: "अनुमानित मूल्य", rv_notes: "टिप्पणी", rv_photo: "फोटो लिंक", rv_schedule: "मनपर्ने समय",
    rv_alt: "वैकल्पिक समय", rv_urgency: "कति छिटो", rv_recurring: "दोहोर्याउने", rv_ward: "वडा", rv_status: "स्थिति",
    rv_created: "अनुरोध मिति", rv_code: "ट्र्याकिङ कोड", rv_final: "अन्तिम रकम", none: "—",
    track_not_found: "यो कोड र फोनका अंकसँग मिल्ने पिकअप भेटिएन। दुवै जाँचेर फेरि प्रयास गर्नुहोस्।",
    track_locked: "धेरै पटक प्रयास भयो। फेरि प्रयास गर्नुअघि एक मिनेट पर्खनुहोस्।",
    track_area: "क्षेत्र", track_date: "मनपर्ने मिति", track_slot: "समय", track_updated: "अन्तिम अपडेट",
    ps_requested: "अनुरोध गरिएको", ps_confirmed: "पुष्टि भएको", ps_assigned: "संकलक तोकिएको", ps_on_the_way: "बाटोमा",
    ps_collected: "संकलन भएको", ps_completed: "पूरा भएको", ps_cancelled: "रद्द गरिएको",
    psd_requested: "हामीले तपाईंको अनुरोध पायौं।", psd_confirmed: "तपाईंको समय पक्का भयो।", psd_assigned: "संकलन टोलीको सदस्य तोकिनुभयो।",
    psd_on_the_way: "टोली तपाईंको ठाउँतर्फ आउँदैछ।", psd_collected: "तपाईंको सामग्री तौलिएर संकलन भयो।",
    psd_completed: "भुक्तानी र रेकर्ड पूरा भयो।", psd_cancelled: "यो अनुरोध रद्द गरियो।",
    dash_loading: "तपाईंका पिकअप लोड हुँदैछन्…", dash_empty: "अहिलेसम्म कुनै पिकअप अनुरोध छैन। तपाईंका बुकिङ यहाँ देखिनेछन्।",
    dash_empty_filter: "यो स्थितिका अनुरोध छैनन्।", dash_error: "अहिले तपाईंका पिकअप लोड गर्न सकिएन।",
    f_all: "सबै", f_active: "सक्रिय", f_completed: "पूरा", f_cancelled: "रद्द",
    details: "विवरण", rebook: "फेरि बुक", cancel: "रद्द गर्नुहोस्",
    cancel_confirm: "पिकअप {code} रद्द गर्ने? यो फिर्ता गर्न मिल्दैन।", cancelled_ok: "पिकअप {code} रद्द गरियो।",
    rebook_ok: "तपाईंको अघिल्लो विवरण बुकिङ फारममा राखियो। कृपया नयाँ मिति छान्नुहोस्।", prefs_saved: "प्राथमिकता सेभ भयो।",
    welcome: "स्वागत छ, {name}!", logged_out: "तपाईं लग आउट हुनुभयो।",
    reset_sent: "त्यो इमेलमा खाता छ भने रिसेट लिंक पठाइएको छ।", register_ok: "खाता बन्यो। SafaCycle मा स्वागत छ!",
    ae_invalid: "इमेल वा पासवर्ड मिलेन।", ae_exists: "यो इमेलमा पहिले नै खाता छ। लग इन गरेर हेर्नुहोस्।",
    ae_weak: "अझ बलियो पासवर्ड छान्नुहोस् (कम्तीमा ८ अक्षर)।", ae_not_enabled: "यो साइन-इन तरिका अहिले सक्रिय छैन। अर्को तरिका प्रयोग गर्नुहोस्।",
    ae_popup: "साइन-इन पूरा हुनुअघि विन्डो बन्द भयो।", ae_popup_blocked: "ब्राउजरले साइन-इन विन्डो रोक्यो। पप-अप अनुमति दिएर फेरि प्रयास गर्नुहोस्।",
    ae_too_many: "धेरै प्रयास भयो। केही मिनेट पर्खेर फेरि प्रयास गर्नुहोस्।", ae_network: "नेटवर्क समस्या। इन्टरनेट जाँच्नुहोस्।",
    ae_domain: "यो वेबसाइट ठेगानालाई साइन-इनको अनुमति अझै दिइएको छैन।",
    member_since: "{date} देखि सदस्य", not_recorded: "अझै रेकर्ड भएको छैन",
    receipt_pending: "टोलीले अन्तिम तौल रेकर्ड गरेपछि रसिद यहाँ देखिन्छ। तल नमूना मात्र हो।", receipt_real: "रसिद",
    sample_label: "नमूना · वास्तविक कारोबार होइन",
    copied: "ट्र्याकिङ कोड कपी भयो।", copy_failed: "आफैं कपी हुन सकेन। कोड छानेर कपी गर्नुहोस्।",
    biz_sent: "धन्यवाद! तपाईंको व्यावसायिक सोधपुछ प्राप्त भयो।", comm_sent: "धन्यवाद! सामुदायिक संकलन दिनमा तपाईंको चासो दर्ता भयो।",
    contact_sent: "सन्देश पठाइयो। तपाईंले दिएको सम्पर्क विवरणमा हामी जवाफ दिनेछौं।",
    rem_saved: "रिमाइन्डर यो ब्राउजरमा सेभ भयो।", rem_off: "रिमाइन्डर बन्द भयो।", rem_next: "अर्को रिमाइन्डर: {date}", rem_none: "कुनै रिमाइन्डर राखिएको छैन।",
    rem_due: "रिसाइक्लिङ रिमाइन्डर: कबाडी जम्मा गरेर छुट्याउने राम्रो समय आयो। तयार हुँदा पिकअप बुक गर्नुहोस्।",
    rem_perm_denied: "ब्राउजर नोटिफिकेसन रोकिएको छ, त्यसैले रिमाइन्डर यो पेजमा मात्र देखिन्छ।", rem_perm_on: "ब्राउजर नोटिफिकेसनको अनुमति छ।",
    rem_perm_unsupported: "यो ब्राउजरले नोटिफिकेसन समर्थन गर्दैन, त्यसैले रिमाइन्डर यो पेजमा मात्र देखिन्छ।",
    chat_welcome: "नमस्ते! म Safa Assistant, एउटा स्वचालित सहायक हुँ। बुकिङ, सामग्री, दर, सेवा क्षेत्र वा कबाडी तयारीबारे सोध्नुहोस्। तलको प्रश्न छान्नुहोस् वा आफ्नै लेख्नुहोस्।",
    chat_fallback: "यसको भरपर्दो जवाफ मसँग छैन। प्रश्नोत्तर हेर्नुहोस् वा सम्पर्क खण्डबाट सन्देश पठाउनुहोस्।",
    chat_limit: "यो सत्रका लागि विस्तृत जवाफको सीमा पुग्यो। सामान्य प्रश्न अझै चल्छन्, प्रश्नोत्तर वा सम्पर्क पनि प्रयोग गर्न सक्नुहुन्छ।",
    chat_cooldown: "अर्को विस्तृत प्रश्न सोध्नुअघि {s} सेकेन्ड पर्खनुहोस्।", chat_busy: "अघिल्लो प्रश्नमा काम हुँदैछ…",
    chat_pii: "तपाईंको गोपनीयताका लागि च्याटमा फोन नम्बर, इमेल वा ठेगाना नलेख्नुहोस्। बुकिङ वा सम्पर्क फारम प्रयोग गर्नुहोस्। तपाईंको सन्देश कतै पठाइएन।",
    chat_ai_off: "विस्तृत जवाफ केही समयका लागि उपलब्ध छैन। सामान्य प्रश्न भने चल्छन्।",
    chat_ai_src: "AI जवाफ · गल्ती हुन सक्छ", chat_faq_src: "हाम्रो प्रश्नोत्तरबाट", chat_cleared: "च्याट मेटाइयो।",
    chat_too_long: "प्रश्न ३०० अक्षरभित्र राख्नुहोस्।", chat_offline: "तपाईं अफलाइन हुनुहुन्छ, त्यसैले अहिले सामान्य प्रश्नको मात्र जवाफ दिन सक्छु।",
    ch_book: "कसरी बुक गर्ने?", ch_materials: "के के लैजानुहुन्छ?", ch_rates: "दर कसरी तय हुन्छ?", ch_areas: "कुन कुन क्षेत्र?",
    ch_prepare: "कसरी तयारी गर्ने?", ch_track: "मेरो पिकअप ट्र्याक", ch_business: "व्यावसायिक पिकअप", ch_hazard: "खतरनाक सामान",
    go_book: "पिकअप बुक गर्नुहोस्", go_rates: "दर बोर्ड खोल्नुहोस्", go_coverage: "क्षेत्र जाँच्नुहोस्", go_toolkit: "टुलकिट खोल्नुहोस्",
    go_track: "पिकअप ट्र्याक", go_business: "व्यावसायिक सोधपुछ", go_contact: "सम्पर्क", go_categories: "प्रकार हेर्नुहोस्",
    go_faq: "प्रश्नोत्तर पढ्नुहोस्", go_calc: "क्याल्कुलेटर खोल्नुहोस्", go_login: "लग इन", no_date: "तोकिएको छैन",
    home: "गृहपृष्ठ",
    ask_expert: "फोहोर विशेषज्ञलाई सोध्नुहोस्", expert_lead: "कुनै सामान कसरी फाल्ने थाहा छैन? नियममा आधारित फोहोर विशेषज्ञलाई आफ्नै शब्दमा बताउनुहोस्।",
    v_gmail: "@gmail.com मा अन्त्य हुने Gmail ठेगाना प्रयोग गर्नुहोस्।",
    v_pw_match: "पासवर्ड मिलेन।",
    v_terms: "कृपया सर्त र गोपनीयता सूचना स्वीकार गर्नुहोस्।",
    gmail_only_err: "SafaCycle मा Gmail खाता (@gmail.com) बाट मात्र लग इन गर्न मिल्छ। कृपया Gmail ठेगाना प्रयोग गर्नुहोस्।",
    ae_disabled: "यो खाता निष्क्रिय गरिएको छ। हामीलाई सम्पर्क गर्नुहोस्।",
    ae_recent: "अगाडि बढ्न फेरि लग इन गर्नुहोस्।",
    verify_sent: "तपाईंको Gmail इनबक्समा पुष्टि गर्ने लिंक पठाइएको छ।",
    verify_ok: "धन्यवाद! तपाईंको इमेल पुष्टि भयो।",
    verify_not_yet: "अझै पुष्टि भएको छैन। इमेलको लिंक खोलेर फेरि प्रयास गर्नुहोस्।",
    verify_wait: "फेरि पठाउनुअघि {s} सेकेन्ड पर्खनुहोस्।",
    verify_title: "कृपया आफ्नो Gmail ठेगाना पुष्टि गर्नुहोस्।",
    verify_body: "हामीले तपाईंको इनबक्समा लिंक पठाएका छौं। पुष्टि भएको खाताले बुकिङ सुरक्षित राख्न मद्दत गर्छ।",
    verify_resend: "इमेल फेरि पठाउनुहोस्", verify_check: "मैले पुष्टि गरें",
    synced: "तपाईंको खातामा सिंक भयो", sync_saving: "खातामा सेभ हुँदैछ…", sync_fail: "सिंक भएन। इन्टरनेट जाँच्नुहोस्।",
    gmail_only: "खाता Gmail ठेगाना (@gmail.com) बाट मात्र बनाउन मिल्छ। तपाईंका बुकिङ, प्राथमिकता, क्याल्कुलेटर सूची र रिमाइन्डर तपाईंकै खातामा सेभ हुन्छन्।",
    f_gmail: "Gmail ठेगाना", f_password_confirm: "पासवर्ड पुष्टि गर्नुहोस्",
    pw_hint: "अक्षर र अंकसहित कम्तीमा ८ वर्ण प्रयोग गर्नुहोस्।",
    pw_weak: "कमजोर पासवर्ड", pw_fair: "ठीकै पासवर्ड", pw_good: "राम्रो पासवर्ड", pw_strong: "बलियो पासवर्ड",
    show_pw: "पासवर्ड देखाउनुहोस्", hide_pw: "पासवर्ड लुकाउनुहोस्",
    forgot_pw: "पासवर्ड बिर्सनुभयो?", back_login: "लग इनमा फर्कनुहोस्", agree_terms: "म यसमा सहमत छु:",
    my_activity: "मेरा अन्य अनुरोध", refresh: "रिफ्रेस",
    my_activity_note: "लग इन गरेर पठाएका व्यावसायिक सोधपुछ, सामुदायिक दिनको चासो, सेवा क्षेत्र अनुरोध र सन्देश।",
    act_business: "व्यावसायिक सोधपुछ", act_community: "सामुदायिक दिन", act_coverage: "सेवा क्षेत्र अनुरोध", act_contact: "सन्देश",
    act_empty: "अहिलेसम्म केही छैन। लग इन गरेर पठाएका फारम यहाँ देखिनेछन्।",
    act_error: "अहिले तपाईंका अन्य अनुरोध लोड गर्न सकिएन।",
    hours_val: "आइतबार – शुक्रबार, बिहान ८:०० – बेलुका ६:००",
    map_val: "भरतपुर महानगरपालिका, चितवन",
    social_val: "Facebook, Instagram र TikTok पेज छिट्टै आउँदैछन्।",
    made_by: "डिजाइन तथा निर्माण:",
    nav_guide: "निर्देशिका", nav_about: "हाम्रोबारे", nav_rates_calc: "दर र क्याल्कुलेटर", nav_track_my: "ट्र्याक र मेरा पिकअप",
    all_rates: "सबै दर हेर्नुहोस्",
    slide1: "भरतपुरबाट सुरु घरदैलो पिकअप", slide2: "बिटा बाँधेर तयार कागज र कार्टुन", slide3: "सफा नारायणी उपत्यकाका लागि",
    ph_rates_t: "कबाडी दर र मूल्य क्याल्कुलेटर", ph_rates_d: "भरतपुरका अनुमानित दर हेर्नुहोस् र बुक गर्नुअघि तपाईंको कबाडीको मूल्य कति होला निकाल्नुहोस्।",
    ph_book_t: "घरदैलो पिकअप बुक गर्नुहोस्", ph_book_d: "तपाईंसँग के छ र कहिले आउने बताउनुहोस्। पाँच छोटा चरण, खाता आवश्यक छैन।",
    ph_track_t: "आफ्नो पिकअप ट्र्याक गर्नुहोस्", ph_track_d: "ट्र्याकिङ कोडबाट अनुरोधको स्थिति हेर्नुहोस्, वा लग इन गरेर सबै पिकअप एकै ठाउँमा व्यवस्थापन गर्नुहोस्।",
    ph_business_t: "व्यावसायिक तथा संस्थागत रिसाइक्लिङ", ph_business_d: "भरतपुरभरका कार्यालय, विद्यालय, होटल, पसल र कार्यक्रमका लागि तालिकाबद्ध पिकअप।",
    ph_guide_t: "रिसाइक्लिङ निर्देशिका र साधन", ph_guide_d: "कबाडी सुरक्षित रूपमा तयार गर्नुहोस्, योगदान अनुमान गर्नुहोस्, रिमाइन्डर राख्नुहोस् र सामुदायिक संकलन दिनमा सहभागी हुनुहोस्।",
    ph_about_t: "हाम्रो उद्देश्य र प्रभाव", ph_about_d: "हामी भरतपुरबाट किन सुरु गर्दैछौं, के मापन गर्नेछौं, र रिसाइक्लिङको काम कस्तो हुन्छ।",
    ph_faq_t: "बारम्बार सोधिने प्रश्न", ph_faq_d: "पिकअप, दर, सुरक्षा र तपाईंको डाटाबारे स्पष्ट जवाफ।",
    ph_contact_t: "SafaCycle लाई सम्पर्क गर्नुहोस्", ph_contact_d: "प्रश्न, सुझाव, वा रद्द गर्नुपर्ने अतिथि बुकिङ? हामीलाई सन्देश पठाउनुहोस्।"
  }
};

/* ---------- Local assistant knowledge ---------- */
const KB = [
  { id: "book", keys: ["book", "booking", "schedule", "pickup", "pick up", "pick-up", "request", "order", "बुक", "पिकअप", "बोलाउ", "लैजान", "bolau"],
    en: "Open Book Pickup and complete five short steps: contact details, location, scrap, schedule and review. After you submit, you get a tracking code. You can book as a guest, or log in first so the request appears in My Pickups.",
    ne: "\"पिकअप बुक गर्नुहोस्\" खोलेर पाँच छोटा चरण पूरा गर्नुहोस्: सम्पर्क विवरण, ठेगाना, कबाडी, समय र पुनरावलोकन। पठाएपछि ट्र्याकिङ कोड पाउनुहुन्छ। अतिथिको रूपमा बुक गर्न सकिन्छ, वा पहिले लग इन गरे अनुरोध \"मेरा पिकअप\" मा देखिन्छ।",
    action: { href: "#book", label: "go_book" } },
  { id: "materials", keys: ["material", "accept", "collect", "what do you", "take", "categories", "category", "items", "सामग्री", "के के", "कुन सामान", "लैजानुहुन्छ"],
    en: "We plan to collect paper and cardboard, plastic, iron and steel, aluminium, copper and brass, glass, e-waste, batteries, appliances and mixed household scrap. Chemicals, medical waste and gas cylinders are not accepted in standard pickups.",
    ne: "हामी कागज र कार्टुन, प्लास्टिक, फलाम र स्टिल, एल्मुनियम, तामा र पित्तल, सिसा, इ-फोहोर, ब्याट्री, उपकरण र मिश्रित घरायसी कबाडी संकलन गर्ने योजनामा छौं। रसायन, स्वास्थ्य संस्थाको फोहोर र ग्यास सिलिन्डर सामान्य पिकअपमा लगिँदैन।",
    action: { href: "#categories", label: "go_categories" } },
  { id: "rates", keys: ["rate", "price", "cost", "how much", "worth", "value", "per kg", "money", "दर", "मूल्य", "भाउ", "कति पैसा", "रेट", "bhau"],
    en: "The Rate board lists estimated rates per kg or per piece, and the Calculator gives a value range. Rates marked Demo are samples for planning. The final price is agreed after inspection and weighing at pickup.",
    ne: "दर बोर्डमा प्रति केजी वा प्रति थानको अनुमानित दर छ, र क्याल्कुलेटरले मूल्यको दायरा देखाउँछ। \"डेमो\" लेखिएका दर योजनाका लागि नमूना हुन्। अन्तिम मूल्य पिकअपमा जाँच र तौलपछि तय हुन्छ।",
    action: { href: "#rates", label: "go_rates" } },
  { id: "areas", keys: ["area", "where", "location", "cover", "service area", "available", "narayangarh", "bharatpur", "chitwan", "tole", "ward", "क्षेत्र", "कहाँ", "टोल", "नारायणगढ", "भरतपुर"],
    en: "Service is starting in Bharatpur and nearby places such as Narayangarh, Hakim Chowk, Chaubiskothi and Pulchowk. Use the area checker to see if your area is Available, Limited, or open for a coverage request.",
    ne: "सेवा भरतपुर र नारायणगढ, हाकिम चोक, चौबीसकोठी, पुल्चोक जस्ता नजिकका ठाउँबाट सुरु हुँदैछ। तपाईंको क्षेत्र उपलब्ध, सीमित वा सेवा माग्न मिल्ने के हो भनेर क्षेत्र जाँचक प्रयोग गर्नुहोस्।",
    action: { href: "#coverage", label: "go_coverage" } },
  { id: "prepare", keys: ["prepare", "sort", "pack", "ready", "clean", "segregat", "तयारी", "छुट्याउ", "प्याक"],
    en: "Sort materials by type, keep them dry, flatten boxes, rinse bottles and tins, and keep copper and brass apart from iron. Wrap broken glass and label it. The Preparation guide in the toolkit has the full checklist.",
    ne: "सामग्री प्रकार अनुसार छुट्याउनुहोस्, सुक्खा राख्नुहोस्, बाकस चेप्टो पार्नुहोस्, बोतल र टिन पखाल्नुहोस्, र तामा-पित्तल फलामबाट अलग राख्नुहोस्। फुटेको सिसा बेरेर लेबल लगाउनुहोस्। पूरा सूची टुलकिटको तयारी निर्देशिकामा छ।",
    action: { href: "#toolkit", label: "go_toolkit" } },
  { id: "track", keys: ["track", "status", "where is", "my pickup", "tracking", "code", "ट्र्याक", "स्थिति", "कोड"],
    en: "Use Track with your tracking code and the last 4 digits of the phone number you booked with. If you booked while logged in, My Pickups shows all your requests. I can't see booking statuses myself.",
    ne: "ट्र्याकिङ कोड र बुक गर्दा प्रयोग गरेको फोनका अन्तिम ४ अंक राखेर \"ट्र्याक\" प्रयोग गर्नुहोस्। लग इन गरेर बुक गर्नुभएको भए \"मेरा पिकअप\" मा सबै अनुरोध देखिन्छ। म आफैं बुकिङको स्थिति हेर्न सक्दिनँ।",
    action: { href: "#track", label: "go_track" } },
  { id: "business", keys: ["business", "office", "school", "college", "hotel", "restaurant", "shop", "warehouse", "company", "bulk", "event", "व्यवसाय", "कार्यालय", "विद्यालय", "होटल", "पसल"],
    en: "Offices, schools, hotels, shops and event organisers can use the Business pickup inquiry form to ask for a one-time clearance or weekly, biweekly or monthly pickups. The team replies with a suggested plan.",
    ne: "कार्यालय, विद्यालय, होटल, पसल र कार्यक्रम आयोजकले व्यावसायिक सोधपुछ फारमबाट एक पटकको सरसफाइ वा हप्तैपिच्छे, दुई हप्तामा वा मासिक पिकअप माग्न सक्छन्। टोलीले योजना सुझाएर जवाफ दिन्छ।",
    action: { href: "#businessInquiry", label: "go_business" } },
  { id: "contact", keys: ["contact", "phone number", "call you", "email you", "whatsapp", "reach", "talk", "सम्पर्क", "फोन गर्ने"],
    en: "Please use the contact form in the Contact section. Official phone and WhatsApp details will be listed there once they are published.",
    ne: "सम्पर्क खण्डको फारम प्रयोग गर्नुहोस्। आधिकारिक फोन र ह्वाट्सएप विवरण प्रकाशित भएपछि त्यहीँ राखिनेछ।",
    action: { href: "#contact", label: "go_contact" } },
  { id: "hazard", keys: ["hazard", "chemical", "medical", "syringe", "medicine", "gas", "cylinder", "leak", "swollen", "poison", "pesticide", "paint", "asbestos", "खतरनाक", "रसायन", "सिलिन्डर", "औषधि", "चुहिएको"],
    en: "Unknown chemicals, medical waste, gas cylinders, pressurised containers and swollen or leaking batteries need special handling and are not part of standard pickups. Don't open, puncture or burn them. Contact the municipality or a qualified hazardous-waste service. In an emergency, call local emergency services.",
    ne: "थाहा नभएका रसायन, स्वास्थ्य संस्थाको फोहोर, ग्यास सिलिन्डर, दबाबयुक्त भाँडा र फुलेका वा चुहिएका ब्याट्रीलाई विशेष व्यवस्थापन चाहिन्छ, र सामान्य पिकअपमा लगिँदैन। यिनलाई नखोल्नुहोस्, नप्वाल्नुहोस्, नजलाउनुहोस्। नगरपालिका वा योग्य सेवालाई सम्पर्क गर्नुहोस्। आपतकालमा आपतकालीन सेवामा फोन गर्नुहोस्।",
    action: { href: "#toolkit", label: "go_toolkit" } },
  { id: "cancel", keys: ["cancel", "reschedule", "change booking", "रद्द", "क्यान्सिल"],
    en: "If you booked while logged in, open My Pickups and cancel while the status is Requested or Confirmed. Guests can send a message through Contact with their tracking code.",
    ne: "लग इन गरेर बुक गर्नुभएको भए \"मेरा पिकअप\" खोलेर स्थिति \"अनुरोध गरिएको\" वा \"पुष्टि भएको\" हुँदा रद्द गर्नुहोस्। अतिथिले ट्र्याकिङ कोडसहित सम्पर्क फारमबाट सन्देश पठाउन सक्नुहुन्छ।",
    action: { href: "#contact", label: "go_contact" } },
  { id: "payment", keys: ["pay", "payment", "cash", "esewa", "khalti", "bank", "भुक्तानी", "पैसा कसरी"],
    en: "The final amount is agreed after your scrap is weighed at the door. Accepted payment methods will be confirmed by the team; nothing is guaranteed online yet.",
    ne: "ढोकामा कबाडी तौलिएपछि अन्तिम रकममा सहमति हुन्छ। भुक्तानीका माध्यम टोलीले पक्का गर्नेछ। अनलाइनमा अहिले कुनै ग्यारेन्टी गरिएको छैन।",
    action: { href: "#faq", label: "go_faq" } },
  { id: "minimum", keys: ["minimum", "small amount", "little", "few kg", "न्यूनतम", "थोरै"],
    en: "There is no fixed minimum at launch, but very small loads may be grouped with other pickups nearby. The team will tell you before confirming.",
    ne: "सुरुमा तोकिएको न्यूनतम छैन, तर धेरै थोरै सामान भए नजिकका अन्य पिकअपसँग मिलाइन सक्छ। पुष्टि गर्नुअघि टोलीले बताउँछ।",
    action: { href: "#book", label: "go_book" } },
  { id: "ewaste", keys: ["phone", "mobile", "laptop", "computer", "electronic", "e-waste", "ewaste", "tv", "charger", "data", "wipe", "मोबाइल", "कम्प्युटर", "ल्यापटप", "इलेक्ट्रोनिक"],
    en: "Yes, common e-waste such as phones, laptops, chargers and cables can be requested. Before handing over a device, back up your data, sign out of accounts, remove SIM and memory cards, and do a factory reset.",
    ne: "मोबाइल, ल्यापटप, चार्जर र तार जस्ता सामान्य इ-फोहोरका लागि अनुरोध गर्न सकिन्छ। दिनुअघि डाटा ब्याकअप गर्नुहोस्, खाताबाट साइन आउट गर्नुहोस्, सिम र मेमोरी कार्ड निकाल्नुहोस्, र फ्याक्ट्री रिसेट गर्नुहोस्।",
    action: { href: "#toolkit", label: "go_toolkit" } },
  { id: "time", keys: ["when", "time", "hour", "open", "today", "tomorrow", "how long", "कहिले", "समय", "भोलि"],
    en: "When booking, you pick a preferred date and a two-hour slot between 8:00 and 18:00. The team then contacts you to confirm the actual time. Official service hours will be listed in Contact.",
    ne: "बुक गर्दा बिहान ८ देखि बेलुका ६ बजेसम्मको दुई घण्टे समय र मनपर्ने मिति छान्नुहुन्छ। त्यसपछि टोलीले वास्तविक समय पक्का गर्न सम्पर्क गर्छ। आधिकारिक सेवा समय सम्पर्क खण्डमा राखिनेछ।",
    action: { href: "#book", label: "go_book" } },
  { id: "account", keys: ["account", "login", "log in", "sign in", "register", "password", "profile", "खाता", "लग इन", "पासवर्ड", "दर्ता"],
    en: "Use Log in at the top to register with email or Google. Your account shows only your own requests, preferences and recycling impact. Use Reset password in the same window if you forget it.",
    ne: "माथिको \"लग इन\" बाट इमेल वा Google मार्फत दर्ता गर्नुहोस्। तपाईंको खातामा आफ्नै अनुरोध, प्राथमिकता र रिसाइक्लिङ योगदान मात्र देखिन्छ। पासवर्ड बिर्सेमा सोही विन्डोमा \"पासवर्ड रिसेट\" प्रयोग गर्नुहोस्।",
    action: { href: "#account", label: "go_login" } },
  { id: "weigh", keys: ["weigh", "scale", "weight", "तौल", "तराजु"],
    en: "Scrap is weighed at your door where you can see the reading, and the weight is recorded on your pickup. The calculator only gives an estimate before that.",
    ne: "कबाडी तपाईंकै ढोकामा, तपाईंले देख्ने गरी तौलिन्छ, र तौल पिकअपमा रेकर्ड हुन्छ। त्यसअघि क्याल्कुलेटरले अनुमान मात्र दिन्छ।",
    action: { href: "#calculator", label: "go_calc" } },
  { id: "human", keys: ["human", "real person", "bot", "robot", "who are you", "are you ai", "मानिस", "तिमी को"],
    en: "I'm Safa Assistant, an automated helper, not a human. For help with your own booking, use My Pickups or the Contact section.",
    ne: "म Safa Assistant, एउटा स्वचालित सहायक हुँ, मानिस होइन। आफ्नो बुकिङसम्बन्धी सहयोगका लागि \"मेरा पिकअप\" वा सम्पर्क खण्ड प्रयोग गर्नुहोस्।",
    action: { href: "#contact", label: "go_contact" } },
  { id: "greeting", keys: ["hello", "hi", "hey", "namaste", "namaskar", "नमस्ते", "नमस्कार"], exact: true,
    en: "Namaste! Ask me about booking, accepted materials, estimated rates, service areas or preparing your scrap.",
    ne: "नमस्ते! बुकिङ, लगिने सामग्री, अनुमानित दर, सेवा क्षेत्र वा कबाडी तयारीबारे सोध्नुहोस्।" }
];
const CHAT_CHIPS = [
  { label: "ch_book", kb: "book" }, { label: "ch_materials", kb: "materials" }, { label: "ch_rates", kb: "rates" },
  { label: "ch_areas", kb: "areas" }, { label: "ch_prepare", kb: "prepare" }, { label: "ch_track", kb: "track" },
  { label: "ch_business", kb: "business" }, { label: "ch_hazard", kb: "hazard" }
];

/* ==========================================================================
   Utilities
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Safe element builder. Text is always set through text nodes. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function icon(name, cls = "icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}
function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function withTimeout(promise, ms, code = "timeout") {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms); })
  ]);
}
const clean = (v, max = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanMultiline = (v, max = 600) => String(v ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

const store = {
  get(key, fallback = null, session = false) {
    try {
      const raw = (session ? sessionStorage : localStorage).getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value, session = false) {
    try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  remove(key, session = false) {
    try { (session ? sessionStorage : localStorage).removeItem(key); } catch { /* storage unavailable */ }
  }
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function locale() { return state.lang === "ne" ? "ne-NP" : "en-IN"; }
function fmtNum(n, digits = 0) {
  try { return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(n); } catch { return String(n); }
}
function fmtRs(n) { return `${state.lang === "ne" ? "रु" : "Rs"} ${fmtNum(Math.round(n))}`; }
function fmtRange(min, max) { return min === max ? fmtRs(min) : `${fmtRs(min)} – ${fmtNum(Math.round(max))}`; }
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDate(value, withTime = false) {
  const d = toDate(value);
  if (!d) return t("no_date");
  const opts = { day: "numeric", month: "short", year: "numeric" };
  if (withTime) Object.assign(opts, { hour: "numeric", minute: "2-digit" });
  try { return new Intl.DateTimeFormat(state.lang === "ne" ? "ne-NP" : "en-GB", opts).format(d); } catch { return d.toDateString(); }
}

/* ---------- Nepal phone numbers ---------- */
function normalizePhone(raw) {
  let v = String(raw || "").replace(/[\s\-().]/g, "");
  if (v.startsWith("+977")) v = v.slice(4);
  else if (v.startsWith("00977")) v = v.slice(5);
  else if (v.startsWith("977") && v.length >= 11) v = v.slice(3);
  if (!/^\d+$/.test(v)) return null;
  if (/^9[678]/.test(v)) return v.length === 10 ? v : null;   // mobile: 97/98/96 + 8 digits
  if (/^0?[1-9]\d{6,8}$/.test(v)) return v;                    // landline with/without trunk 0
  return null;
}

/* ---------- Tracking codes ---------- */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I
function generateTrackingCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join("");
  return `SC-${chars.slice(0, 4)}-${chars.slice(4)}`;
}
function normalizeCode(raw) {
  let v = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.startsWith("SC")) v = v.slice(2);
  if (v.length !== 8) return null;
  return `SC-${v.slice(0, 4)}-${v.slice(4)}`;
}

/* ==========================================================================
   State
   ========================================================================== */
const state = {
  lang: store.get("sc_lang", "en") === "ne" ? "ne" : "en",
  user: null,
  profile: null,
  rates: [],
  rateSource: "demo",
  ratesUpdated: null,
  rateFilter: "all",
  rateView: store.get("sc_rate_view", "grid") === "list" ? "list" : "grid",
  rateSort: "name",
  rateQuery: "",
  calc: [],
  bookingStep: 1,
  imported: null,
  lastBooking: null,
  requests: [],
  requestsState: "idle",
  dashFilter: "all",
  unsubRequests: null,
  submitting: new WeakSet(),
  trackFails: 0,
  trackLockedUntil: 0
};

const fb = { ready: false, app: null, db: null, auth: null, fs: null, authMod: null, analytics: null, analyticsMod: null };
let resolveRatesReady;
const ratesReady = new Promise((r) => { resolveRatesReady = r; });

/* ==========================================================================
   i18n
   ========================================================================== */
function t(key, vars) {
  let s = I18N[state.lang]?.[key] ?? I18N.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
function catName(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c[state.lang] : id;
}
function rateName(r) { return (state.lang === "ne" && r.ne) ? r.ne : r.en; }
function areaName(a) { return state.lang === "ne" ? a.ne : a.en; }

function applyLanguage() {
  const lang = state.lang;
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach((node) => {
    if (node.dataset.en == null) node.dataset.en = node.textContent;
    const key = node.dataset.i18n;
    node.textContent = lang === "ne" ? (I18N.ne[key] ?? node.dataset.en) : node.dataset.en;
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    if (node.dataset.enPh == null) node.dataset.enPh = node.getAttribute("placeholder") || "";
    const key = node.dataset.i18nPlaceholder;
    node.setAttribute("placeholder", lang === "ne" ? (I18N.ne[key] ?? node.dataset.enPh) : node.dataset.enPh);
  });
  $$("[data-lang-label]").forEach((n) => { n.textContent = lang === "ne" ? "English" : "नेपाली"; });
  $$("[data-lang-toggle]").forEach((b) => b.setAttribute("aria-label", lang === "ne" ? t("lang_to_en") : t("lang_to_ne")));
  updateAccountUI();
  renderAreaUI();
  renderRateFilters();
  renderRates();
  renderMiniCalcOptions();
  renderCalc();
  renderBookingMaterials();
  renderImported();
  updateStepUI();
  if (state.bookingStep === 5) renderReview();
  renderDashFilters();
  renderRequests();
  renderChatChips();
  updateReminderStatus();
  updateImpactEstimator();
  updateAuthHint();
  updateTitle();
}

function toggleLanguage() {
  state.lang = state.lang === "en" ? "ne" : "en";
  store.set("sc_lang", state.lang);
  applyLanguage();
  if (state.user) queueSync({ language: state.lang });
}

/* ==========================================================================
   Toasts
   ========================================================================== */
function toast(message, type = "ok", { action, timeout = 5000 } = {}) {
  const wrap = $("#toasts");
  const iconName = type === "error" ? "alert" : type === "warn" ? "info" : "check";
  const node = el("div", { class: `toast toast--${type}`, role: type === "error" ? "alert" : "status" }, icon(iconName), el("span", { text: message }));
  if (action) {
    node.append(el("button", { class: "btn btn--lime btn--xs", type: "button", text: action.label, onclick: () => { action.onClick(); dismiss(); } }));
  }
  const closeBtn = el("button", { class: "toast__close", type: "button", "aria-label": "Dismiss" }, icon("x"));
  node.append(closeBtn);
  const dismiss = () => {
    if (!node.isConnected) return;
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 260);
  };
  closeBtn.addEventListener("click", dismiss);
  wrap.append(node);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
  if (timeout) setTimeout(dismiss, timeout);
}

function friendlyError(err) {
  const code = err?.code || err?.message || "";
  if (!navigator.onLine) return t("err_offline");
  if (code === "fb-unavailable") return t("err_fb");
  if (code === "timeout") return t("err_timeout");
  if (code.includes("permission-denied") || code.includes("unauthenticated")) return t("err_permission");
  if (code.includes("unavailable")) return t("err_offline");
  const map = {
    "auth/invalid-credential": "ae_invalid", "auth/invalid-login-credentials": "ae_invalid", "auth/missing-password": "v_required",
    "auth/user-disabled": "ae_disabled", "auth/requires-recent-login": "ae_recent", "auth/admin-restricted-operation": "ae_not_enabled", "auth/wrong-password": "ae_invalid", "auth/user-not-found": "ae_invalid",
    "auth/invalid-email": "v_email", "auth/email-already-in-use": "ae_exists", "auth/weak-password": "ae_weak",
    "auth/operation-not-allowed": "ae_not_enabled", "auth/configuration-not-found": "ae_not_enabled",
    "auth/popup-closed-by-user": "ae_popup", "auth/cancelled-popup-request": "ae_popup", "auth/popup-blocked": "ae_popup_blocked",
    "auth/too-many-requests": "ae_too_many", "auth/network-request-failed": "ae_network", "auth/unauthorized-domain": "ae_domain"
  };
  if (map[code]) return t(map[code]);
  return t("err_generic");
}

/* ==========================================================================
   Firebase (lazy, fail-safe)
   ========================================================================== */
const firebaseReady = (async () => {
  try {
    const appMod = await import(fbUrl("app"));
    fb.app = appMod.initializeApp(firebaseConfig);

    if (CONFIG.APP_CHECK_SITE_KEY) {
      try {
        const ac = await import(fbUrl("app-check"));
        ac.initializeAppCheck(fb.app, { provider: new ac.ReCaptchaV3Provider(CONFIG.APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
      } catch (e) { console.warn("App Check could not start:", e?.message); }
    }

    const [fs, authMod] = await Promise.all([import(fbUrl("firestore")), import(fbUrl("auth"))]);
    fb.fs = fs;
    fb.authMod = authMod;
    fb.db = fs.getFirestore(fb.app);
    fb.auth = authMod.getAuth(fb.app);
    fb.auth.languageCode = state.lang === "ne" ? "ne" : "en";
    fb.ready = true;
    authMod.onAuthStateChanged(fb.auth, handleAuthChange, (e) => console.warn("Auth listener error:", e?.code));
    return true;
  } catch (e) {
    console.warn("Firebase unavailable:", e?.message);
    fb.ready = false;
    toast(t("fb_unavailable"), "warn", { timeout: 8000 });
    return false;
  }
})();

async function requireFirebase() {
  await firebaseReady;
  if (!fb.ready) throw Object.assign(new Error("fb-unavailable"), { code: "fb-unavailable" });
  if (!navigator.onLine) throw Object.assign(new Error("offline"), { code: "unavailable" });
}

function initAnalytics() {
  if (!CONFIG.ANALYTICS_ENABLED) return;
  const start = async () => {
    try {
      if (!(await firebaseReady)) return;
      const mod = await import(fbUrl("analytics"));
      if (await mod.isSupported()) {
        fb.analytics = mod.getAnalytics(fb.app);
        fb.analyticsMod = mod;
      }
    } catch (e) { console.warn("Analytics disabled:", e?.message); }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 3000);
}
function logEvent(name, params = {}) {
  try { if (fb.analytics) fb.analyticsMod.logEvent(fb.analytics, name, params); } catch { /* ignore */ }
}

/* ==========================================================================
   Dialogs, drawer, scroll lock
   ========================================================================== */
const openers = new WeakMap();
function syncScrollLock() {
  const anyOpen = $$("dialog[open]").length > 0;
  document.documentElement.classList.toggle("is-locked", anyOpen);
}
function openDialog(id, opener = document.activeElement) {
  const dlg = document.getElementById(id);
  if (!dlg || dlg.open) return;
  openers.set(dlg, opener);
  dlg.showModal();
  syncScrollLock();
}
function closeDialog(dlg, restoreFocus = true) {
  if (!dlg?.open) return;
  if (!restoreFocus) dlg.dataset.noRestore = "1";
  dlg.close();
  syncScrollLock();
}

function initDialogs() {
  $$("dialog").forEach((dlg) => {
    dlg.addEventListener("close", () => {
      syncScrollLock();
      const opener = openers.get(dlg);
      const restore = dlg.dataset.noRestore !== "1";
      delete dlg.dataset.noRestore;
      if (restore && opener && typeof opener.focus === "function" && opener.isConnected) opener.focus({ preventScroll: true });
      if (dlg.id === "mobileNav") $("#menuToggle").setAttribute("aria-expanded", "false");
    });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  });
  document.addEventListener("click", (e) => {
    const closer = e.target.closest("[data-close]");
    if (closer) closeDialog(closer.closest("dialog"));
    const opener = e.target.closest("[data-open-dialog]");
    if (opener) openDialog(opener.dataset.openDialog, opener);
  });
  $("#menuToggle").addEventListener("click", (e) => {
    openDialog("mobileNav", e.currentTarget);
    e.currentTarget.setAttribute("aria-expanded", "true");
  });
  $("#mobileNav").addEventListener("click", (e) => {
    if (e.target.closest("a[href^='#']")) closeDialog($("#mobileNav"), false);
  });
}

/* ==========================================================================
   Header, navigation, scroll effects
   ========================================================================== */
function initScrollUI() {
  const header = $("#siteHeader");
  const toTop = $("#toTop");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      header.classList.toggle("is-scrolled", y > 8);
      toTop.hidden = y < 900;
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    $("#main").focus?.({ preventScroll: true });
  });

  if ("IntersectionObserver" in window) {
    const reveal = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); obs.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    $$(".reveal").forEach((n) => reveal.observe(n));
  } else {
    $$(".reveal").forEach((n) => n.classList.add("is-visible"));
  }
}

/* ==========================================================================
   View router — each major area is its own panel inside index.html.
   Any in-page link (#id) opens the view that contains that id.
   ========================================================================== */
const HOME_TITLE = document.title;
let currentView = null;

function viewFor(id) {
  const target = id ? document.getElementById(id) : null;
  return { target, view: target?.closest(".view") || null };
}
function updateTitle() {
  if (!currentView || currentView.id === "view-home") { document.title = HOME_TITLE; return; }
  const h1 = $("h1", currentView);
  document.title = `${h1 ? h1.textContent.trim() : ""} | SafaCycle Chitwan`;
}
function updateNavState() {
  $$("[data-nav]").forEach((a) => {
    const { view } = viewFor(a.getAttribute("href").slice(1));
    const active = view && view === currentView;
    a.classList.toggle("is-active", Boolean(active));
    if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
function route({ initial = false } = {}) {
  const id = decodeURIComponent(location.hash.slice(1));
  let { target, view } = viewFor(id);
  if (!view) {
    if (target) return; // element outside views (e.g. #main): let the browser handle it
    view = $("#view-home");
    target = null;
  }
  const changed = view !== currentView;
  const reduced = prefersReducedMotion();
  const swap = () => {
    $$(".view").forEach((v) => { v.hidden = v !== view; });
    currentView = view;
    updateNavState();
    updateTitle();
    if (view.id === "view-home") slider.resume(); else slider.pause(false);
  };
  const place = () => {
    const top = !target || target === view || target.id === "top" || target === view.querySelector(".page-hero + section");
    if (top) window.scrollTo({ top: 0, behavior: changed || reduced ? "auto" : "smooth" });
    else target.scrollIntoView({ behavior: changed || reduced ? "auto" : "smooth", block: "start" });
    if (changed && !initial) {
      const focusEl = top ? $("h1", view) : ($("h1, h2, h3, legend", target) || target);
      if (focusEl) {
        if (!focusEl.hasAttribute("tabindex")) focusEl.setAttribute("tabindex", "-1");
        focusEl.focus({ preventScroll: true });
      }
    }
  };
  if (changed && !initial && !reduced && document.startViewTransition) {
    const vt = document.startViewTransition(swap);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
    vt.updateCallbackDone.then(place, place);
  } else {
    swap();
    if (changed && !initial && !reduced) {
      view.classList.remove("is-entering");
      void view.offsetWidth;
      view.classList.add("is-entering");
      view.addEventListener("animationend", () => view.classList.remove("is-entering"), { once: true });
    }
    place();
  }
}
function navigate(id) {
  if (`#${id}` !== location.hash) history.pushState(null, "", `#${id}`);
  route();
}
function scrollToId(id) { navigate(id); }

function initRouter() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    if (!id || !viewFor(id).view) return;
    e.preventDefault();
    navigate(id);
  });
  window.addEventListener("popstate", () => route());
  route({ initial: true });
}

/* ---------- Hero slider (auto-advance, pausable, reduced-motion aware) ---------- */
const slider = (() => {
  const INTERVAL = 6000;
  let timer = null, index = 0, userPaused = false, slides = [], dots = [], root = null;
  const show = (i) => {
    if (!slides.length) return;
    const prev = slides[index];
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const on = n === index;
      s.classList.toggle("is-active", on);
      s.classList.toggle("is-leaving", s === prev && !on);
      s.setAttribute("aria-hidden", String(!on));
      const img = $("img", s);
      if (on && img.loading === "lazy") img.loading = "eager";
    });
    dots.forEach((d, n) => d.setAttribute("aria-current", String(n === index)));
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => {
    stop();
    if (userPaused || prefersReducedMotion() || !root || document.hidden) { root?.classList.add("is-paused"); return; }
    root.classList.remove("is-paused");
    timer = setInterval(() => show(index + 1), INTERVAL);
  };
  const setPauseBtn = () => {
    const btn = $("#heroPause");
    btn.replaceChildren(icon(userPaused ? "play" : "pause"));
    btn.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
  };
  return {
    init() {
      root = $("#heroSlider");
      if (!root) return;
      root.style.setProperty("--slide-ms", `${INTERVAL}ms`);
      slides = $$(".slide", root);
      dots = $$(".slider__dot", root);
      dots.forEach((d, n) => d.addEventListener("click", () => { show(n); start(); }));
      if (prefersReducedMotion()) userPaused = true;
      $("#heroPause").addEventListener("click", () => { userPaused = !userPaused; setPauseBtn(); start(); });
      root.addEventListener("mouseenter", stop);
      root.addEventListener("mouseleave", start);
      root.addEventListener("focusin", stop);
      root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) start(); });
      document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
      // Swipe support
      let x0 = null;
      root.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      root.addEventListener("touchend", (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) { show(index + (dx < 0 ? 1 : -1)); start(); }
        x0 = null;
      }, { passive: true });
      setPauseBtn();
      start();
    },
    pause() { stop(); },
    resume() { start(); }
  };
})();

/* ---------- Category carousel ---------- */
function initCategoryCarousel() {
  const track = $("#catGrid");
  const prev = $("#catPrev"), next = $("#catNext");
  if (!track || !prev) return;
  const step = () => (track.firstElementChild?.getBoundingClientRect().width || 280) + 16;
  const update = () => {
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  const go = (dir) => track.scrollBy({ left: dir * step(), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  track.addEventListener("scroll", debounce(update, 80), { passive: true });
  track.addEventListener("keydown", (e) => {
    if (e.target !== track) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  });
  window.addEventListener("resize", debounce(update, 150));
  update();
}

function initOffline() {
  const banner = $("#offlineBanner");
  const update = () => { banner.hidden = navigator.onLine; };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

/* ==========================================================================
   Accordion + tabs
   ========================================================================== */
function initAccordion() {
  $$(".acc__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      document.getElementById(btn.getAttribute("aria-controls")).hidden = open;
    });
  });
}

function initTablist(list, onChange) {
  const tabs = $$("[role='tab']", list);
  const select = (tab, focus = true) => {
    tabs.forEach((tb) => {
      const on = tb === tab;
      tb.setAttribute("aria-selected", String(on));
      tb.tabIndex = on ? 0 : -1;
      document.getElementById(tb.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    onChange?.(tab);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next); }
    });
  });
  return { select: (id) => { const tab = tabs.find((x) => x.id === id); if (tab) select(tab, false); } };
}

/* ==========================================================================
   Form validation
   ========================================================================== */
function errorNode(input) { return document.getElementById(`${input.id}-err`); }
function setFieldError(input, message) {
  const node = errorNode(input);
  if (message) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  if (node) node.textContent = message || "";
}
function validateField(input) {
  const v = input.type === "checkbox" ? input.checked : input.value.trim();
  const rule = input.dataset.validate;
  if (input.required && (input.type === "checkbox" ? !v : v === "")) {
    if (input.type === "checkbox") return input.id === "rgTerms" ? t("v_terms") : t("v_consent");
    return t("v_required");
  }
  if (v === "" || v === false) return "";
  switch (rule) {
    case "email": case "email-optional":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : t("v_email");
    case "phone": case "phone-optional":
      return normalizePhone(v) ? "" : t("v_phone");
    case "url":
      try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? "" : t("v_url"); } catch { return t("v_url"); }
    case "ward": {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 35 ? "" : t("v_ward");
    }
    case "future-date":
      return v >= todayISO() ? "" : t("v_date");
    case "nonneg": {
      const n = Number(v);
      const max = Number(input.max || Infinity);
      return Number.isFinite(n) && n >= 0 && n <= max ? "" : t("v_number");
    }
    case "code":
      return normalizeCode(v) ? "" : t("v_code");
    case "last4":
      return /^\d{4}$/.test(v) ? "" : t("v_last4");
    case "password":
      return v.length >= 8 && /[a-z]/i.test(v) && /\d/.test(v) ? "" : t("v_password");
    case "gmail":
      return isGmail(v) ? "" : t("v_gmail");
    case "confirm":
      return v === $("#rgPass").value ? "" : t("v_pw_match");
    default:
      if (input.minLength > 0 && v.length < input.minLength) return t("v_minlen", { n: input.minLength });
      return "";
  }
}
function validateFields(inputs) {
  let first = null;
  inputs.forEach((input) => {
    const msg = validateField(input);
    setFieldError(input, msg);
    if (msg && !first) first = input;
  });
  if (first) first.focus();
  return !first;
}
function formInputs(root) { return $$("input, select, textarea", root).filter((n) => n.id && n.type !== "hidden"); }
function initLiveValidation() {
  document.addEventListener("input", (e) => {
    const input = e.target;
    if (input.matches?.("[aria-invalid='true']")) setFieldError(input, validateField(input));
  });
  document.addEventListener("change", (e) => {
    const input = e.target;
    if (input.matches?.("[aria-invalid='true']")) setFieldError(input, validateField(input));
  });
}
function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle("is-loading", loading);
  btn.disabled = loading;
  btn.setAttribute("aria-busy", String(loading));
}

/** Generic create-only form submission with duplicate-submit protection. */
async function submitCreateForm(form, { collectionName, buildData, validate, successMsg, after }) {
  if (state.submitting.has(form)) return;
  const inputs = formInputs(form);
  if (!validateFields(inputs) || (validate && !validate())) { toast(t("v_fix"), "error"); return; }
  const btn = $("button[type='submit']", form);
  state.submitting.add(form);
  setLoading(btn, true);
  try {
    await requireFirebase();
    const { fs, db } = fb;
    const data = { ...buildData(), language: state.lang, createdAt: fs.serverTimestamp() };
    await withTimeout(fs.addDoc(fs.collection(db, collectionName), data), CONFIG.WRITE_TIMEOUT_MS);
    toast(successMsg());
    form.reset();
    after?.();
    if (state.user) { prefillFromProfile(); loadActivity(); }
    logEvent("form_submit", { form: collectionName });
  } catch (e) {
    console.warn(`${collectionName} submit failed:`, e?.code || e?.message);
    toast(friendlyError(e), "error");
  } finally {
    state.submitting.delete(form);
    setLoading(btn, false);
  }
}

/* ==========================================================================
   Service areas
   ========================================================================== */
function normalizeText(s) { return String(s || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function findArea(query) {
  const q = normalizeText(query);
  if (!q) return null;
  const names = (a) => [a.en, a.ne, ...a.alt].map(normalizeText);
  let hit = AREAS.find((a) => names(a).includes(q));
  if (!hit && q.length >= 4) hit = AREAS.find((a) => names(a).some((n) => n.includes(q) || q.includes(n)));
  return hit || null;
}
function renderAreaUI() {
  const list = $("#areaList");
  list.replaceChildren(...AREAS.flatMap((a) => [el("option", { value: a.en }), el("option", { value: a.ne })]));
  const chips = $("#areaChips");
  chips.replaceChildren(...AREAS.map((a) => el("button", {
    class: "chip", type: "button",
    onclick: () => { $("#coverageArea").value = areaName(a); checkCoverage(); }
  }, el("span", { class: `status-dot status-dot--${a.status === "available" ? "ok" : "limited"}`, "aria-hidden": "true" }), areaName(a),
     el("span", { class: "sr-only", text: ` (${a.status === "available" ? t("cov_available") : t("cov_limited")})` }))));
  $("#footerAreas").textContent = AREAS.filter((a) => a.status === "available").map(areaName).join(" · ");
}
function checkCoverage() {
  const input = $("#coverageArea");
  const value = clean(input.value, 60);
  const out = $("#coverageResult");
  const reqForm = $("#coverageRequestForm");
  if (!value) { setFieldError(input, t("v_required")); input.focus(); return; }
  setFieldError(input, "");
  const area = findArea(value);
  let cls, iconName, title, desc, cta = null;
  if (area?.status === "available") {
    cls = "ok"; iconName = "check"; title = t("cov_available"); desc = t("cov_available_d", { area: areaName(area) });
  } else if (area?.status === "limited") {
    cls = "limited"; iconName = "clock"; title = t("cov_limited"); desc = t("cov_limited_d", { area: areaName(area) });
  } else {
    cls = "none"; iconName = "pin"; title = t("cov_none"); desc = t("cov_none_d", { area: value });
  }
  if (area) cta = el("a", { class: "btn btn--primary btn--sm", href: "#book", onclick: () => { $("#bkArea").value = area.en; } }, t("book_now"));
  out.replaceChildren(el("div", { class: `cov-result cov-result--${cls}` }, icon(iconName),
    el("div", {}, el("strong", { text: title }), el("p", { text: desc }), cta ? el("div", { class: "btn-row" }, cta) : null)));
  reqForm.hidden = Boolean(area);
  reqForm.dataset.area = value;
}
function initCoverage() {
  $("#coverageForm").addEventListener("submit", (e) => { e.preventDefault(); checkCoverage(); });
  const reqForm = $("#coverageRequestForm");
  reqForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const area = clean(reqForm.dataset.area, 60);
    const done = store.get("sc_cov_req", [], true);
    if (done.includes(area.toLowerCase())) { toast(t("cov_already"), "warn"); return; }
    submitCreateForm(reqForm, {
      collectionName: "coverageRequests",
      buildData: () => {
        const phone = normalizePhone($("#covPhone").value);
        return { area, name: clean($("#covName").value, 60) || null, phone: phone || null, userId: state.user?.uid || null };
      },
      successMsg: () => t("cov_sent", { area }),
      after: () => { store.set("sc_cov_req", [...done, area.toLowerCase()], true); reqForm.hidden = true; }
    });
  });
}

/* ==========================================================================
   Rates
   ========================================================================== */
function validRate(id, d) {
  const cat = String(d.category || "");
  const unit = d.unit === "pc" || d.unit === "piece" ? "pc" : d.unit === "kg" ? "kg" : null;
  const min = Number(d.minRate), max = Number(d.maxRate);
  if (!CAT_IDS.includes(cat) || !unit || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return null;
  const en = clean(d.nameEn || d.name, 60);
  if (!en) return null;
  return { id, cat, en, ne: clean(d.nameNe, 60) || null, unit, min, max };
}

async function fetchLiveRates() {
  await requireFirebase();
  const { fs, db } = fb;
  const q = fs.query(fs.collection(db, "scrapRates"), fs.where("active", "==", true), fs.limit(200));
  const snap = await withTimeout(fs.getDocs(q), CONFIG.READ_TIMEOUT_MS);
  let latest = null;
  const items = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const r = validRate(docSnap.id, d);
    if (r) items.push(r);
    const u = toDate(d.updatedAt);
    if (u && (!latest || u > latest)) latest = u;
  });
  return { items, updated: latest ? latest.toISOString() : null };
}

async function loadRates() {
  const cached = store.get("sc_rates_v1");
  const now = Date.now();
  if (cached && Array.isArray(cached.items) && cached.items.length) {
    const ttl = cached.source === "live" ? CONFIG.RATE_CACHE_TTL_MS : CONFIG.RATE_FALLBACK_TTL_MS;
    if (now - cached.t < ttl) {
      setRates(cached.items, cached.source, cached.updated);
      return;
    }
  }
  try {
    const { items, updated } = await fetchLiveRates();
    if (items.length) {
      setRates(items, "live", updated);
      store.set("sc_rates_v1", { t: now, source: "live", items, updated });
      return;
    }
  } catch (e) {
    console.info("Using demo rates:", e?.code || e?.message);
  }
  setRates(DEMO_RATES, "demo", null);
  store.set("sc_rates_v1", { t: now, source: "demo", items: DEMO_RATES, updated: null });
}

function setRates(items, source, updated) {
  state.rates = items;
  state.rateSource = source;
  state.ratesUpdated = updated;
  $("#rateBoard").setAttribute("aria-busy", "false");
  renderRateMeta();
  renderRateFilters();
  renderRates();
  renderCategoryRanges();
  renderMiniCalcOptions();
  // Re-map calculator rows that referenced rates that no longer exist
  state.calc.forEach((row) => {
    if (!getRate(row.rateId)) row.rateId = state.rates.find((r) => r.cat === row.cat)?.id || state.rates[0]?.id;
  });
  renderCalc();
  resolveRatesReady();
}
const getRate = (id) => state.rates.find((r) => r.id === id);

function renderRateMeta() {
  const live = state.rateSource === "live";
  const badge = $("#rateSourceBadge");
  badge.className = `badge ${live ? "badge--ok" : "badge--warn"}`;
  const txt = $("#rateSourceText");
  txt.dataset.i18n = live ? "rate_live_badge" : "rate_demo_badge";
  txt.dataset.en = live ? I18N.en.rate_live_badge : I18N.en.rate_demo_badge;
  txt.textContent = t(txt.dataset.i18n);
  const time = $("#ratesUpdated");
  if (live && state.ratesUpdated) {
    time.dateTime = state.ratesUpdated;
    time.textContent = fmtDate(state.ratesUpdated);
  } else {
    time.removeAttribute("datetime");
    time.textContent = live ? t("no_date") : t("demo_est");
  }
}

function renderRateFilters() {
  const wrap = $("#rateFilters");
  const cats = ["all", ...CAT_IDS.filter((c) => state.rates.some((r) => r.cat === c))];
  wrap.replaceChildren(...cats.map((c) => el("button", {
    class: "filter-chip", type: "button", "aria-pressed": String(state.rateFilter === c),
    onclick: () => { state.rateFilter = c; renderRateFilters(); renderRates(); }
  }, c === "all" ? t("all") : catName(c))));
}

function renderRates() {
  const board = $("#rateBoard");
  if (!state.rates.length) return; // skeleton stays until data is ready
  const q = normalizeText(state.rateQuery);
  let list = state.rates.filter((r) => state.rateFilter === "all" || r.cat === state.rateFilter);
  if (q) list = list.filter((r) => normalizeText(`${r.en} ${r.ne || ""} ${catName(r.cat)} ${CATEGORIES.find((c) => c.id === r.cat)?.en}`).includes(q));
  const mid = (r) => (r.min + r.max) / 2;
  if (state.rateSort === "high") list.sort((a, b) => mid(b) - mid(a));
  else if (state.rateSort === "low") list.sort((a, b) => mid(a) - mid(b));
  else list.sort((a, b) => rateName(a).localeCompare(rateName(b), locale()));

  board.className = `rate-board rate-board--${state.rateView}`;
  const live = state.rateSource === "live";
  board.replaceChildren(...list.map((r) => el("li", { class: "rate-item" },
    el("div", {}, el("p", { class: "rate-item__name", text: rateName(r) }), el("p", { class: "rate-item__cat", text: catName(r.cat) })),
    el("p", { class: "rate-item__price" }, fmtRange(r.min, r.max), el("span", { text: ` ${r.unit === "kg" ? t("per_kg") : t("per_pc")}` })),
    el("div", { class: "rate-item__foot" },
      el("span", { class: `rate-flag ${live ? "rate-flag--ok" : ""}`, text: live ? t("rate_flag_est") : t("rate_flag_demo") }),
      el("button", { class: "btn btn--soft btn--xs", type: "button", "aria-label": `${t("add")}: ${rateName(r)}`, onclick: () => addCalcRow(r.id, 1, true) },
        icon("plus"), el("span", { text: t("add") })))
  )));
  $("#rateEmpty").hidden = list.length > 0;
  $("#rateCount").textContent = t("rates_count", { n: list.length });
}

function renderCategoryRanges() {
  const live = state.rateSource === "live";
  $$("[data-range]").forEach((node) => {
    const items = state.rates.filter((r) => r.cat === node.dataset.range);
    if (!items.length) { node.textContent = "—"; return; }
    const min = Math.min(...items.map((r) => r.min));
    const max = Math.max(...items.map((r) => r.max));
    const units = new Set(items.map((r) => r.unit));
    const unitTxt = units.size > 1 ? "" : ` ${items[0].unit === "kg" ? t("per_kg") : t("per_pc")}`;
    node.replaceChildren(document.createTextNode(`${fmtRange(min, max)}${unitTxt}`),
      el("small", { text: units.size > 1 ? `${live ? t("est_rate") : t("demo_est")} · ${t("varies")}` : (live ? t("est_rate") : t("demo_est")) }));
  });
}

function initRates() {
  const search = $("#rateSearch");
  search.addEventListener("input", debounce(() => { state.rateQuery = search.value.slice(0, 40); renderRates(); }, 220));
  $("#rateSort").addEventListener("change", (e) => { state.rateSort = e.target.value; renderRates(); });
  $$(".seg__btn").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === state.rateView));
    b.addEventListener("click", () => {
      state.rateView = b.dataset.view;
      store.set("sc_rate_view", state.rateView);
      $$(".seg__btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderRates();
    });
  });
  $$("[data-add-cat]").forEach((b) => b.addEventListener("click", async () => {
    await ratesReady;
    const r = state.rates.find((x) => x.cat === b.dataset.addCat);
    if (r) addCalcRow(r.id, 1, true);
  }));
  loadRates();
}

/* ==========================================================================
   Calculator
   ========================================================================== */
let rowSeq = 0;
function rateOptions(select, selectedId) {
  select.replaceChildren(...CATEGORIES.map((c) => {
    const items = state.rates.filter((r) => r.cat === c.id);
    if (!items.length) return null;
    return el("optgroup", { label: c[state.lang] }, ...items.map((r) => el("option", { value: r.id, selected: r.id === selectedId }, rateName(r))));
  }).filter(Boolean));
}
function rowEstimate(row) {
  const r = getRate(row.rateId);
  const qty = Math.max(0, Number(row.qty) || 0);
  return r ? { min: r.min * qty, max: r.max * qty, unit: r.unit, qty, r } : { min: 0, max: 0, unit: "kg", qty, r: null };
}
function saveCalc() {
  const list = state.calc.map(({ rateId, cat, qty }) => ({ rateId, cat, qty }));
  store.set("sc_calc", list, true);
  if (state.user) queueSync({ calc: sanitizeCalc(list) }, 2000);
}

function addCalcRow(rateId, qty = 1, announce = false) {
  const r = getRate(rateId) || state.rates[0];
  if (!r) return;
  const existing = state.calc.find((row) => row.rateId === r.id);
  if (existing && announce) existing.qty = Number(existing.qty || 0) + Number(qty || 0);
  else state.calc.push({ key: ++rowSeq, rateId: r.id, cat: r.cat, qty });
  saveCalc();
  renderCalc();
  if (announce) toast(t("added_calc", { name: rateName(r) }), "ok", { action: { label: t("view_calc"), onClick: () => scrollToId("calculator") }, timeout: 3500 });
}

function renderCalc() {
  const wrap = $("#calcRows");
  if (!wrap) return;
  wrap.replaceChildren(...state.calc.map((row) => {
    const selectId = `calc-mat-${row.key}`;
    const qtyId = `calc-qty-${row.key}`;
    const select = el("select", { id: selectId, class: "input input--sm" });
    rateOptions(select, row.rateId);
    const est = rowEstimate(row);
    const unitSuffix = el("span", { class: "input-unit__suffix", text: est.unit === "kg" ? t("unit_kg") : t("unit_pc") });
    const qty = el("input", { id: qtyId, class: "input input--sm", type: "number", inputmode: "decimal", min: "0", max: "20000", step: est.unit === "kg" ? "0.5" : "1", value: row.qty });
    const estNode = el("strong", { text: fmtRange(est.min, est.max) });
    select.addEventListener("change", () => {
      row.rateId = select.value; row.cat = getRate(select.value)?.cat;
      saveCalc(); renderCalc();
      document.getElementById(selectId)?.focus();
    });
    qty.addEventListener("input", () => {
      const n = Number(qty.value);
      row.qty = Number.isFinite(n) && n >= 0 ? Math.min(n, 20000) : 0;
      const e2 = rowEstimate(row);
      estNode.textContent = fmtRange(e2.min, e2.max);
      saveCalc(); renderCalcTotals();
    });
    return el("div", { class: "calc-row" },
      el("div", { class: "field" }, el("label", { for: selectId, text: t("material") }), select),
      el("div", { class: "field" }, el("label", { for: qtyId, text: t("quantity") }), el("div", { class: "input-unit" }, qty, unitSuffix)),
      el("button", {
        class: "btn-icon btn-icon--sm", type: "button", "aria-label": t("remove_row", { name: est.r ? rateName(est.r) : "" }),
        onclick: () => {
          state.calc = state.calc.filter((x) => x !== row); saveCalc(); renderCalc();
          ($("#calcRows select") || $("#calcAdd")).focus();
        }
      }, icon("trash")),
      el("p", { class: "calc-row__est" }, el("span", { text: t("estimate") }), estNode)
    );
  }));
  $("#calcEmpty").hidden = state.calc.length > 0;
  renderCalcTotals();
}
function calcTotals() {
  return state.calc.reduce((acc, row) => {
    const e = rowEstimate(row);
    acc.min += e.min; acc.max += e.max;
    if (e.unit === "kg") acc.kg += e.qty; else acc.pcs += e.qty;
    return acc;
  }, { min: 0, max: 0, kg: 0, pcs: 0 });
}
function renderCalcTotals() {
  const tot = calcTotals();
  $("#calcWeight").textContent = `${fmtNum(tot.kg, 1)} ${t("unit_kg")}${tot.pcs ? ` + ${fmtNum(tot.pcs)} ${t("unit_pc")}` : ""}`;
  $("#calcTotal").textContent = fmtRange(tot.min, tot.max);
}
function initCalculator() {
  $("#calcAdd").addEventListener("click", async () => {
    await ratesReady;
    const used = new Set(state.calc.map((r) => r.rateId));
    const next = state.rates.find((r) => !used.has(r.id)) || state.rates[0];
    addCalcRow(next.id, 1);
    const selects = $$("#calcRows select");
    selects[selects.length - 1]?.focus();
  });
  $("#calcReset").addEventListener("click", () => { state.calc = []; saveCalc(); renderCalc(); $("#calcAdd").focus(); });
  $("#calcToBooking").addEventListener("click", () => {
    const items = state.calc.map(rowEstimate).filter((e) => e.r && e.qty > 0);
    if (!items.length) { toast(t("calc_need_items"), "error"); return; }
    const tot = calcTotals();
    state.imported = {
      items: items.map((e) => ({ rateId: e.r.id, cat: e.r.cat, en: e.r.en, ne: e.r.ne, unit: e.unit, qty: e.qty })),
      min: Math.round(tot.min), max: Math.round(tot.max), kg: tot.kg, basis: state.rateSource
    };
    const cats = new Set(items.map((e) => e.r.cat));
    $$("#bkMaterials input").forEach((c) => { if (cats.has(c.value)) c.checked = true; });
    if (!$("#bkWeight").value && tot.kg) $("#bkWeight").value = String(Math.round(tot.kg * 10) / 10);
    renderImported();
    showStep(1);
    scrollToId("book");
    toast(t("calc_sent"));
  });

  // Mini estimator in hero
  const form = $("#miniCalc");
  const update = () => {
    const r = getRate($("#miniMaterial").value);
    const qty = Math.max(0, Number($("#miniQty").value) || 0);
    $("#miniUnit").textContent = r?.unit === "pc" ? t("unit_pc") : t("unit_kg");
    $("#miniResult").textContent = r ? fmtRange(r.min * qty, r.max * qty) : "—";
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await ratesReady;
    addCalcRow($("#miniMaterial").value, Math.max(0, Number($("#miniQty").value) || 0));
    scrollToId("calculator");
  });
  form._update = update;

  const saved = store.get("sc_calc", [], true);
  if (Array.isArray(saved)) ratesReady.then(() => {
    if (state.calc.length) return;
    state.calc = saved.filter((r) => r && typeof r.rateId === "string").slice(0, 30).map((r) => ({ key: ++rowSeq, rateId: r.rateId, cat: r.cat, qty: Number(r.qty) || 0 }));
    state.calc.forEach((row) => { if (!getRate(row.rateId)) row.rateId = state.rates.find((x) => x.cat === row.cat)?.id || state.rates[0].id; });
    renderCalc();
  });
}
function renderMiniCalcOptions() {
  const select = $("#miniMaterial");
  if (!select || !state.rates.length) return;
  const current = select.value || state.rates.find((r) => r.cat === "paper")?.id;
  rateOptions(select, current);
  $("#miniCalc")._update?.();
}

/* ==========================================================================
   Booking
   ========================================================================== */
const TOTAL_STEPS = 5;
function renderBookingMaterials() {
  const wrap = $("#bkMaterials");
  const checked = new Set($$("input:checked", wrap).map((c) => c.value));
  wrap.replaceChildren(...CATEGORIES.map((c) => el("label", { class: "check-tile" },
    el("input", { type: "checkbox", name: "materials", value: c.id, checked: checked.has(c.id) }), el("span", { text: c[state.lang] }))));
}
function renderImported() {
  const box = $("#bkImported");
  if (!state.imported) { box.hidden = true; return; }
  box.hidden = false;
  $("#bkImportedList").replaceChildren(
    ...state.imported.items.map((i) => el("li", {}, el("span", { text: state.lang === "ne" && i.ne ? i.ne : i.en }),
      el("span", { text: `${fmtNum(i.qty, 1)} ${i.unit === "kg" ? t("unit_kg") : t("unit_pc")}` }))),
    el("li", {}, el("strong", { text: t("rv_value") }), el("strong", { text: fmtRange(state.imported.min, state.imported.max) }))
  );
}
function updateStepUI() {
  const n = state.bookingStep;
  $$("#bookProgress .progress__step").forEach((li, i) => {
    li.classList.toggle("is-done", i + 1 < n);
    if (i + 1 === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
  $("#bkStepCount").textContent = t("step_of", { n: fmtNum(n), total: fmtNum(TOTAL_STEPS) });
  $("#bkBack").hidden = n === 1;
  $("#bkNext").hidden = n === TOTAL_STEPS;
  $("#bkSubmit").hidden = n !== TOTAL_STEPS;
}
function showStep(n, focus = false) {
  state.bookingStep = n;
  $$("#bookingForm .bstep").forEach((fs) => { fs.hidden = Number(fs.dataset.step) !== n; });
  if (n === TOTAL_STEPS) renderReview();
  updateStepUI();
  if (focus) {
    const legend = $(`#bookingForm .bstep[data-step="${n}"] legend`);
    legend.tabIndex = -1;
    legend.focus({ preventScroll: true });
    const shell = $(".booking__shell");
    if (shell.getBoundingClientRect().top < 0) shell.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
}
function validateStep(n) {
  const fieldset = $(`#bookingForm .bstep[data-step="${n}"]`);
  let ok = validateFields(formInputs(fieldset).filter((i) => i.name !== "materials"));
  if (n === 3) {
    const any = $$("#bkMaterials input:checked").length > 0 || Boolean(state.imported);
    $("#bkMaterials-err").textContent = any ? "" : t("v_materials");
    if (!any && ok) { $("#bkMaterials input")?.focus(); ok = false; }
  }
  return ok;
}
function selectedText(select) { return select.selectedOptions[0]?.textContent?.trim() || ""; }
function bookingSnapshot() {
  const val = (id) => $(id).value.trim();
  return {
    customerName: clean(val("#bkName"), 80),
    email: clean(val("#bkEmail"), 120).toLowerCase(),
    phone: normalizePhone(val("#bkPhone")) || "",
    contactMethod: $("#bkContact").value,
    area: clean(val("#bkArea"), 60),
    ward: Number(val("#bkWard")) || null,
    landmark: clean(val("#bkLandmark"), 100),
    address: cleanMultiline(val("#bkAddress"), 300),
    mapLink: clean(val("#bkMap"), 300) || null,
    materials: $$("#bkMaterials input:checked").map((c) => c.value),
    estimatedWeight: val("#bkWeight") === "" ? null : Math.min(20000, Math.max(0, Number(val("#bkWeight")))),
    quantity: val("#bkQty") === "" ? null : Math.min(5000, Math.max(0, Math.round(Number(val("#bkQty"))))),
    photoLink: clean(val("#bkPhoto"), 300) || null,
    notes: cleanMultiline(val("#bkNotes"), 400) || null,
    preferredDate: val("#bkDate"),
    preferredTime: $("#bkTime").value,
    urgency: $("#bkUrgency").value,
    alternativeTime: clean(val("#bkAlt"), 80) || null,
    recurring: $("#bkRecurring").value
  };
}
function renderReview() {
  const s = bookingSnapshot();
  const rows = [
    ["rv_name", s.customerName], ["rv_email", s.email], ["rv_phone", s.phone], ["rv_contact", selectedText($("#bkContact"))],
    ["rv_location", `${s.area}${s.ward ? `, ${t("rv_ward")} ${fmtNum(s.ward)}` : ""}`], ["rv_landmark", s.landmark], ["rv_address", s.address],
    ["rv_map", s.mapLink], ["rv_materials", s.materials.map(catName).join(", ")],
    ["rv_items", state.imported ? state.imported.items.map((i) => `${state.lang === "ne" && i.ne ? i.ne : i.en} (${fmtNum(i.qty, 1)} ${i.unit === "kg" ? t("unit_kg") : t("unit_pc")})`).join(", ") : null],
    ["rv_weight", s.estimatedWeight != null ? `${fmtNum(s.estimatedWeight, 1)} ${t("unit_kg")}` : null],
    ["rv_qty", s.quantity != null ? fmtNum(s.quantity) : null],
    ["rv_value", state.imported ? fmtRange(state.imported.min, state.imported.max) : null],
    ["rv_photo", s.photoLink], ["rv_notes", s.notes],
    ["rv_schedule", `${fmtDate(s.preferredDate)} · ${selectedText($("#bkTime"))}`], ["rv_alt", s.alternativeTime],
    ["rv_urgency", selectedText($("#bkUrgency"))], ["rv_recurring", selectedText($("#bkRecurring"))]
  ].filter(([, v]) => v != null && v !== "");
  $("#bkReview").replaceChildren(...rows.map(([k, v]) => el("div", {}, el("dt", { text: t(k) }), el("dd", { text: v }))));
}
function updateAuthHint() {
  const hint = $("#bookAuthHint");
  if (!hint) return;
  hint.textContent = state.user ? t("user_hint", { name: state.user.displayName || state.user.email }) : (fb.ready ? t("guest_hint") : "");
}

async function submitBooking(e) {
  e.preventDefault();
  const form = $("#bookingForm");
  if (state.submitting.has(form)) return;
  for (let n = 1; n <= TOTAL_STEPS; n++) {
    if (!validateStep(n)) { showStep(n); validateStep(n); toast(t("v_fix"), "error"); return; }
  }
  const btn = $("#bkSubmit");
  state.submitting.add(form);
  setLoading(btn, true);
  try {
    await requireFirebase();
    const { fs, db } = fb;
    const s = bookingSnapshot();
    const code = generateTrackingCode();
    const last4 = s.phone.slice(-4);
    const uid = fb.auth.currentUser?.uid || null;
    const ts = fs.serverTimestamp();
    const request = {
      ...s,
      trackingCode: code,
      userId: uid,
      materialItems: state.imported ? state.imported.items.map((i) => ({ rateId: i.rateId, category: i.cat, name: i.en, unit: i.unit, qty: i.qty })) : [],
      estimatedValue: state.imported ? { min: state.imported.min, max: state.imported.max, currency: "NPR", basis: state.imported.basis } : null,
      status: "requested",
      language: state.lang,
      source: "web",
      createdAt: ts,
      updatedAt: ts
    };
    const tracking = {
      trackingCode: code, status: "requested", area: s.area, preferredDate: s.preferredDate, preferredTime: s.preferredTime,
      userId: uid, createdAt: ts, updatedAt: ts
    };
    const batch = fs.writeBatch(db);
    batch.set(fs.doc(fs.collection(db, "pickupRequests")), request);
    batch.set(fs.doc(db, "pickupTracking", `${code}_${last4}`), tracking);
    await withTimeout(batch.commit(), CONFIG.WRITE_TIMEOUT_MS);

    if (uid) {
      const patch = { phone: s.phone };
      if (!state.profile?.preferredArea) patch.preferredArea = s.area;
      if (s.recurring !== "none") patch.recurring = s.recurring;
      queueSync(patch, 0);
    }
    state.lastBooking = { code, last4 };
    logEvent("pickup_requested", { materials: s.materials.length, recurring: s.recurring });
    form.reset();
    $("#bkUrgency").value = "standard";
    state.imported = null;
    renderImported();
    prefillFromProfile();
    showStep(1);
    $("#confirmCode").textContent = code;
    openDialog("confirmDialog", $("#bkNext"));
    toast(t("booking_success"));
  } catch (err) {
    console.warn("Booking failed:", err?.code || err?.message);
    toast(friendlyError(err), "error", { timeout: 8000 });
  } finally {
    state.submitting.delete(form);
    setLoading(btn, false);
  }
}

function prefillFromProfile(force = false) {
  if (!state.user) return;
  const p = state.profile || {};
  const name = p.displayName || state.user.displayName || "";
  const email = state.user.email || "";
  const phone = p.phone || "";
  const fill = (id, v) => { const n = $(id); if (n && v && (force || !n.value)) n.value = v; };
  fill("#bkName", name); fill("#bkEmail", email); fill("#bkPhone", phone); fill("#bkArea", p.preferredArea);
  fill("#ctName", name); fill("#ctEmail", email); fill("#ctPhone", phone);
  fill("#bzPerson", name); fill("#bzEmail", email); fill("#bzPhone", phone);
  fill("#cmName", name); fill("#cmPhone", phone); fill("#cmArea", p.preferredArea);
  if (p.recurring && (force || $("#bkRecurring").value === "none")) $("#bkRecurring").value = p.recurring;
}

function initBooking() {
  const date = $("#bkDate");
  date.min = todayISO();
  renderBookingMaterials();
  $("#bkNext").addEventListener("click", () => {
    if (validateStep(state.bookingStep)) showStep(state.bookingStep + 1, true);
  });
  $("#bkBack").addEventListener("click", () => showStep(Math.max(1, state.bookingStep - 1), true));
  $("#bkClearImported").addEventListener("click", () => { state.imported = null; renderImported(); });
  $("#bkMaterials").addEventListener("change", () => { $("#bkMaterials-err").textContent = ""; });
  $("#bookingForm").addEventListener("submit", submitBooking);
  $("#bookingForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox" && state.bookingStep < TOTAL_STEPS) {
      e.preventDefault();
      $("#bkNext").click();
    }
  });
  $("#copyCode").addEventListener("click", async () => {
    const code = $("#confirmCode").textContent;
    try {
      await navigator.clipboard.writeText(code);
      toast(t("copied"));
    } catch {
      const range = document.createRange();
      range.selectNodeContents($("#confirmCode"));
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      toast(t("copy_failed"), "warn");
    }
  });
  $("#confirmTrack").addEventListener("click", () => {
    closeDialog($("#confirmDialog"), false);
    if (state.lastBooking) {
      $("#trackCode").value = state.lastBooking.code;
      $("#trackPhone").value = state.lastBooking.last4;
      scrollToId("track");
      $("#trackForm").requestSubmit();
    }
  });
  showStep(1);
}

/* ==========================================================================
   Tracking
   ========================================================================== */
function statusBadge(status) {
  const s = PICKUP_STATUSES.includes(status) || status === "cancelled" ? status : "requested";
  return el("span", { class: `status status--${s}`, text: t(`ps_${s}`) });
}
function renderTimeline(status) {
  const cancelled = status === "cancelled";
  const idx = cancelled ? 0 : Math.max(0, PICKUP_STATUSES.indexOf(status));
  const steps = cancelled ? ["requested", "cancelled"] : PICKUP_STATUSES;
  return el("ol", { class: "timeline" }, ...steps.map((s, i) => {
    let cls = "tl-step";
    let label;
    if (cancelled) {
      cls += s === "cancelled" ? " is-cancelled is-current" : " is-done";
      label = s === "cancelled" ? "✕" : null;
    } else if (i < idx || (i === idx && s === "completed")) cls += " is-done";
    else if (i === idx) cls += " is-current";
    const done = cls.includes("is-done");
    return el("li", { class: cls, "aria-current": cls.includes("is-current") ? "step" : null },
      el("span", { class: "tl-dot", "aria-hidden": "true" }, done ? icon("check") : (label || String(i + 1))),
      el("div", { class: "tl-text" }, el("strong", { text: t(`ps_${s}`) }), el("span", { text: t(`psd_${s}`) }),
        el("span", { class: "sr-only", text: done ? " ✓" : "" })));
  }));
}
async function handleTrack(e) {
  e.preventDefault();
  const form = $("#trackForm");
  if (state.submitting.has(form)) return;
  const out = $("#trackResult");
  if (Date.now() < state.trackLockedUntil) { toast(t("track_locked"), "warn"); return; }
  if (!validateFields([$("#trackCode"), $("#trackPhone")])) return;
  const code = normalizeCode($("#trackCode").value);
  const last4 = $("#trackPhone").value.trim();
  $("#trackCode").value = code;
  const btn = $("button[type='submit']", form);
  state.submitting.add(form);
  setLoading(btn, true);
  out.setAttribute("aria-busy", "true");
  out.replaceChildren(el("div", { class: "skeleton", style: "height:24px;border-radius:8px;margin-bottom:12px" }),
    el("div", { class: "skeleton", style: "height:160px;border-radius:12px" }));
  try {
    await requireFirebase();
    const { fs, db } = fb;
    const snap = await withTimeout(fs.getDoc(fs.doc(db, "pickupTracking", `${code}_${last4}`)), CONFIG.READ_TIMEOUT_MS);
    if (!snap.exists()) {
      state.trackFails++;
      if (state.trackFails >= CONFIG.TRACK_MAX_FAILS) { state.trackLockedUntil = Date.now() + CONFIG.TRACK_LOCK_MS; state.trackFails = 0; }
      out.replaceChildren(el("div", { class: "empty-state" }, icon("search"), el("p", { text: t("track_not_found") })));
      return;
    }
    state.trackFails = 0;
    const d = snap.data();
    const status = String(d.status || "requested");
    // Only customer-safe fields are rendered here.
    out.replaceChildren(
      el("div", { class: "track-head" }, el("code", { text: code }), statusBadge(status)),
      el("div", { class: "track-meta" },
        el("span", {}, el("strong", { text: `${t("track_area")}: ` }), clean(d.area, 60) || "—"),
        el("span", {}, el("strong", { text: `${t("track_date")}: ` }), fmtDate(d.preferredDate)),
        el("span", {}, el("strong", { text: `${t("track_slot")}: ` }), clean(d.preferredTime, 20) || "—"),
        el("span", {}, el("strong", { text: `${t("track_updated")}: ` }), fmtDate(d.updatedAt, true))),
      renderTimeline(status)
    );
  } catch (err) {
    out.replaceChildren(el("div", { class: "empty-state error-state" }, icon("alert"), el("p", { text: friendlyError(err) })));
  } finally {
    out.setAttribute("aria-busy", "false");
    state.submitting.delete(form);
    setLoading(btn, false);
  }
}

/* ==========================================================================
   Authentication + dashboard
   ========================================================================== */
let authTabs;
// Accounts are limited to consumer Gmail addresses. Firestore rules enforce the same.
const GMAIL_RE = /^[a-z0-9][a-z0-9.+_-]{0,63}@gmail\.com$/i;
const isGmail = (email) => GMAIL_RE.test(String(email || "").trim());

function updateAccountUI() {
  const signedIn = Boolean(state.user);
  $$("[data-account-label]").forEach((n) => {
    n.dataset.i18n = signedIn ? "my_pickups" : "login";
    n.dataset.en = signedIn ? I18N.en.my_pickups : I18N.en.login;
    n.textContent = t(n.dataset.i18n);
  });
  $$("[data-account-short]").forEach((n) => {
    n.dataset.i18n = signedIn ? "my_pickups" : "account";
    n.dataset.en = signedIn ? I18N.en.my_pickups : I18N.en.account;
    n.textContent = t(n.dataset.i18n);
  });
}
function openAccount(opener, tab = "atab-login") {
  if (state.user) {
    closeDialog($("#mobileNav"), false);
    scrollToId("dashboard");
    return;
  }
  closeDialog($("#mobileNav"));
  setAuthStatus("");
  authTabs.select(tab);
  openDialog("authDialog", opener);
}
function setAuthStatus(msg, ok = false) {
  const n = $("#authStatus");
  n.textContent = msg;
  n.classList.toggle("is-ok", ok);
}

/* ---------- Profile document + account sync ---------- */
let profileJob = null;
let pendingDisplayName = "";
const syncState = { patch: {}, timer: null, running: null };

function sanitizeCalc(list) {
  return list.filter((r) => r && typeof r.rateId === "string").slice(0, 30)
    .map((r) => ({ rateId: r.rateId.slice(0, 60), cat: CAT_IDS.includes(r.cat) ? r.cat : "mixed", qty: Math.min(20000, Math.max(0, Number(r.qty) || 0)) }));
}
function sanitizeReminder(rem) {
  if (!rem || !rem.next) return null;
  return { freq: [7, 14, 30].includes(Number(rem.freq)) ? Number(rem.freq) : 30, day: Math.min(6, Math.max(0, Number(rem.day) || 0)), next: String(rem.next).slice(0, 40) };
}
function setSyncIndicator(mode) {
  const n = $("#profileSync");
  if (!n) return;
  n.classList.toggle("is-saving", mode !== "ok");
  const label = $("span", n);
  label.dataset.i18n = mode === "saving" ? "sync_saving" : mode === "fail" ? "sync_fail" : "synced";
  label.dataset.en = I18N.en[label.dataset.i18n];
  label.textContent = t(label.dataset.i18n);
}
/** Queue a merge-write to users/{uid}. Batches rapid changes into one write. */
function queueSync(patch, delay = 1200) {
  if (!state.user || !fb.ready) return;
  Object.assign(syncState.patch, patch);
  state.profile = { ...(state.profile || {}), ...patch };
  setSyncIndicator("saving");
  clearTimeout(syncState.timer);
  syncState.timer = setTimeout(flushSync, delay);
}
async function flushSync() {
  clearTimeout(syncState.timer);
  if (!state.user || !Object.keys(syncState.patch).length) return syncState.running;
  const uid = state.user.uid;
  const patch = syncState.patch;
  syncState.patch = {};
  const { fs, db } = fb;
  syncState.running = withTimeout(fs.setDoc(fs.doc(db, "users", uid), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true }), CONFIG.WRITE_TIMEOUT_MS)
    .then(() => { setSyncIndicator("ok"); return true; })
    .catch((e) => { console.warn("Account sync failed:", e?.code || e?.message); setSyncIndicator("fail"); syncState.lastError = e; return false; });
  return syncState.running;
}

function ensureProfile(user) {
  if (profileJob?.uid === user.uid) return profileJob.promise;
  const promise = (async () => {
    const { fs, db } = fb;
    const ref = fs.doc(db, "users", user.uid);
    try {
      const snap = await withTimeout(fs.getDoc(ref), CONFIG.READ_TIMEOUT_MS);
      if (snap.exists()) {
        state.profile = snap.data();
        if (!state.profile.displayName && (pendingDisplayName || user.displayName)) {
          queueSync({ displayName: clean(pendingDisplayName || user.displayName, 80) }, 0);
        }
        return;
      }
      const profile = {
        displayName: clean(pendingDisplayName || user.displayName || "", 80),
        email: (user.email || "").toLowerCase(),
        phone: "",
        preferredArea: "",
        recurring: "none",
        language: state.lang,
        calc: sanitizeCalc(state.calc),
        reminder: sanitizeReminder(store.get("sc_reminder")),
        createdAt: fs.serverTimestamp(),
        updatedAt: fs.serverTimestamp()
      };
      await withTimeout(fs.setDoc(ref, profile), CONFIG.WRITE_TIMEOUT_MS);
      state.profile = profile;
    } catch (e) {
      console.warn("Profile unavailable:", e?.code || e?.message);
      state.profile = state.profile || null;
      setSyncIndicator("fail");
    }
  })();
  profileJob = { uid: user.uid, promise };
  return promise;
}

/** Bring account-saved data into this browser, or push local data up if the account has none. */
async function applyAccountData() {
  const p = state.profile;
  if (!p) return;
  if ((p.language === "en" || p.language === "ne") && p.language !== state.lang) {
    state.lang = p.language;
    store.set("sc_lang", state.lang);
    applyLanguage();
  }
  await ratesReady;
  if (Array.isArray(p.calc) && p.calc.length && !state.calc.length) {
    state.calc = sanitizeCalc(p.calc).map((r) => ({ key: ++rowSeq, ...r }));
    state.calc.forEach((row) => { if (!getRate(row.rateId)) row.rateId = state.rates.find((x) => x.cat === row.cat)?.id || state.rates[0].id; });
    store.set("sc_calc", sanitizeCalc(state.calc), true);
    renderCalc();
  } else if (state.calc.length && JSON.stringify(sanitizeCalc(state.calc)) !== JSON.stringify(sanitizeCalc(p.calc || []))) {
    queueSync({ calc: sanitizeCalc(state.calc) });
  }
  const localRem = store.get("sc_reminder");
  if (p.reminder && !localRem) { store.set("sc_reminder", p.reminder); updateReminderStatus(); }
  else if (localRem && !p.reminder) queueSync({ reminder: sanitizeReminder(localRem) });
}

function updateVerifyBanner() {
  const u = state.user;
  const needs = Boolean(u && !u.emailVerified && u.providerData.some((p) => p.providerId === "password"));
  $("#verifyBanner").hidden = !needs;
}

async function authAction(form, fn) {
  if (state.submitting.has(form)) return;
  if (!validateFields(formInputs(form))) return;
  const btn = $("button[type='submit']", form);
  state.submitting.add(form);
  setLoading(btn, true);
  setAuthStatus("");
  try {
    await requireFirebase();
    await fn();
  } catch (e) {
    console.warn("Auth error:", e?.code);
    setAuthStatus(friendlyError(e));
  } finally {
    state.submitting.delete(form);
    setLoading(btn, false);
  }
}

function passwordLevel(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) score++;
  if (/[^a-z0-9]/i.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  return pw ? Math.max(1, score) : 0;
}
function updatePasswordMeter() {
  const pw = $("#rgPass").value;
  const level = passwordLevel(pw);
  const meter = $("#rgPass-hint");
  meter.dataset.level = String(level);
  $("#pwBar").style.width = `${level * 25}%`;
  const key = ["pw_hint", "pw_weak", "pw_fair", "pw_good", "pw_strong"][level];
  const txt = $("#pwText");
  txt.dataset.i18n = key;
  txt.dataset.en = I18N.en[key] ?? txt.dataset.en;
  txt.textContent = t(key);
}

function initAuth() {
  authTabs = initTablist($(".auth-tabs"), (tab) => {
    setAuthStatus("");
    $("#googleBtn").hidden = tab.id === "atab-reset";
    $(".auth-divider").hidden = tab.id === "atab-reset";
  });
  $$("[data-account-btn]").forEach((b) => b.addEventListener("click", () => openAccount(b)));
  $$("[data-auth-tab]").forEach((b) => b.addEventListener("click", () => {
    const email = $("#lgEmail").value || $("#rsEmail").value;
    authTabs.select(b.dataset.authTab);
    if (b.dataset.authTab === "atab-reset" && email) $("#rsEmail").value = email;
    $(`#${b.dataset.authTab}`).focus();
  }));

  // Show / hide password
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".pw-toggle");
    if (!btn) return;
    const input = document.getElementById(btn.getAttribute("aria-controls"));
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? t("hide_pw") : t("show_pw"));
    btn.replaceChildren(icon(show ? "eye-off" : "eye"));
  });
  $("#rgPass").addEventListener("input", () => {
    updatePasswordMeter();
    if ($("#rgPass2").value) setFieldError($("#rgPass2"), validateField($("#rgPass2")));
  });

  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    authAction(form, async () => {
      const cred = await fb.authMod.signInWithEmailAndPassword(fb.auth, $("#lgEmail").value.trim().toLowerCase(), $("#lgPass").value);
      closeDialog($("#authDialog"), false);
      form.reset();
      toast(t("welcome", { name: cred.user.displayName || cred.user.email }));
      navigate("dashboard");
    });
  });
  $("#registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    authAction(form, async () => {
      const name = clean($("#rgName").value, 80);
      pendingDisplayName = name;
      const cred = await fb.authMod.createUserWithEmailAndPassword(fb.auth, $("#rgEmail").value.trim().toLowerCase(), $("#rgPass").value);
      await fb.authMod.updateProfile(cred.user, { displayName: name }).catch(() => {});
      let verifyMsg = "";
      try {
        fb.auth.languageCode = state.lang;
        await fb.authMod.sendEmailVerification(cred.user);
        verifyMsg = ` ${t("verify_sent")}`;
      } catch (err) { console.warn("Verification email failed:", err?.code); }
      renderProfile();
      closeDialog($("#authDialog"), false);
      form.reset();
      updatePasswordMeter();
      toast(`${t("register_ok")}${verifyMsg}`, "ok", { timeout: 8000 });
      navigate("dashboard");
    });
  });
  $("#resetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    authAction(form, async () => {
      try {
        fb.auth.languageCode = state.lang;
        await fb.authMod.sendPasswordResetEmail(fb.auth, $("#rsEmail").value.trim().toLowerCase());
      } catch (err) {
        // Avoid revealing whether an account exists
        if (err?.code !== "auth/user-not-found") throw err;
      }
      setAuthStatus(t("reset_sent"), true);
      form.reset();
    });
  });
  $("#googleBtn").addEventListener("click", async () => {
    const btn = $("#googleBtn");
    if (btn.disabled) return;
    btn.disabled = true;
    setAuthStatus("");
    try {
      await requireFirebase();
      const provider = new fb.authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await fb.authMod.signInWithPopup(fb.auth, provider);
      if (!isGmail(cred.user.email)) {
        // handleAuthChange signs non-Gmail accounts out
        setAuthStatus(t("gmail_only_err"));
        return;
      }
      closeDialog($("#authDialog"), false);
      toast(t("welcome", { name: cred.user.displayName || cred.user.email }));
      navigate("dashboard");
    } catch (e) {
      console.warn("Google sign-in error:", e?.code);
      setAuthStatus(friendlyError(e));
    } finally {
      btn.disabled = false;
    }
  });
  $("#logoutBtn").addEventListener("click", async () => {
    try {
      await flushSync();
      await fb.authMod.signOut(fb.auth);
      toast(t("logged_out"));
      navigate("top");
    } catch (e) { toast(friendlyError(e), "error"); }
  });

  // Email verification helpers
  let lastVerifySend = 0;
  $("#verifyResend").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!state.user || btn.disabled) return;
    const wait = 60000 - (Date.now() - lastVerifySend);
    if (wait > 0) { toast(t("verify_wait", { s: Math.ceil(wait / 1000) }), "warn"); return; }
    setLoading(btn, true);
    try {
      fb.auth.languageCode = state.lang;
      await fb.authMod.sendEmailVerification(state.user);
      lastVerifySend = Date.now();
      toast(t("verify_sent"));
    } catch (err) { toast(friendlyError(err), "error"); }
    finally { setLoading(btn, false); }
  });
  $("#verifyCheck").addEventListener("click", async () => {
    if (!state.user) return;
    try {
      await state.user.reload();
      if (fb.auth.currentUser?.emailVerified) {
        await fb.auth.currentUser.getIdToken(true);
        state.user = fb.auth.currentUser;
        toast(t("verify_ok"));
      } else toast(t("verify_not_yet"), "warn");
      updateVerifyBanner();
    } catch (err) { toast(friendlyError(err), "error"); }
  });

  $("#prefsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!state.user || state.submitting.has(form)) return;
    if (!validateFields(formInputs(form))) return;
    const btn = $("button[type='submit']", form);
    state.submitting.add(form);
    setLoading(btn, true);
    try {
      await requireFirebase();
      const displayName = clean($("#prefName").value, 80);
      queueSync({
        displayName,
        phone: normalizePhone($("#prefPhone").value) || "",
        preferredArea: clean($("#prefArea").value, 60),
        recurring: $("#prefRecurring").value
      }, 0);
      const saved = await flushSync();
      if (saved === false) throw syncState.lastError || new Error("sync");
      fb.authMod.updateProfile(state.user, { displayName }).catch(() => {});
      renderProfile();
      prefillFromProfile(true);
      toast(t("prefs_saved"));
    } catch (err) { toast(friendlyError(err), "error"); }
    finally { state.submitting.delete(form); setLoading(btn, false); }
  });
  $("#activityRefresh").addEventListener("click", () => loadActivity());
}

async function handleAuthChange(user) {
  try {
    if (user && !isGmail(user.email)) {
      // Non-Gmail account (for example a Google Workspace address): not allowed.
      await fb.authMod.signOut(fb.auth).catch(() => {});
      toast(t("gmail_only_err"), "error", { timeout: 8000 });
      return;
    }
    const previous = state.user;
    state.user = user || null;
    fb.auth.languageCode = state.lang;
    updateAccountUI();
    updateAuthHint();
    updateVerifyBanner();
    const dash = $("#dashboard");
    if (state.unsubRequests) { state.unsubRequests(); state.unsubRequests = null; }
    if (!user) {
      profileJob = null;
      pendingDisplayName = "";
      state.profile = null;
      state.requests = [];
      state.requestsState = "idle";
      dash.hidden = true;
      $("#activityList").replaceChildren();
      if (previous) {
        // Clear personal data from this browser session after logout
        $("#bookingForm").reset();
        state.imported = null;
        renderImported();
        showStep(1);
        state.calc = [];
        store.remove("sc_calc", true);
        renderCalc();
      }
      return;
    }
    dash.hidden = false;
    renderProfile();
    subscribeRequests(user.uid);
    await ensureProfile(user);
    renderProfile();
    prefillFromProfile();
    await applyAccountData();
    loadActivity();
  } catch (e) {
    console.warn("Auth state handling failed:", e?.message);
  }
}

function renderProfile() {
  if (!state.user) return;
  const name = state.profile?.displayName || state.user.displayName || pendingDisplayName || state.user.email?.split("@")[0] || "—";
  $("#profileName").textContent = name;
  $("#profileEmail").textContent = state.user.email || "";
  $("#profileAvatar").textContent = (name.trim()[0] || "S").toUpperCase();
  const since = state.user.metadata?.creationTime;
  $("#profileSince").textContent = since ? t("member_since", { date: fmtDate(since) }) : "";
  $("#prefName").value = name === "—" ? "" : name;
  $("#prefPhone").value = state.profile?.phone || "";
  $("#prefArea").value = state.profile?.preferredArea || "";
  $("#prefRecurring").value = state.profile?.recurring || "none";
}

/* ---------- "My other requests": forms sent while logged in ---------- */
const ACTIVITY_SOURCES = [
  { col: "businessInquiries", label: "act_business", summary: (d) => clean(d.organizationName, 60) },
  { col: "communityCampaigns", label: "act_community", summary: (d) => clean(d.area, 60) },
  { col: "coverageRequests", label: "act_coverage", summary: (d) => clean(d.area, 60) },
  { col: "contactMessages", label: "act_contact", summary: (d) => clean(d.message, 70) }
];
async function loadActivity() {
  const list = $("#activityList");
  if (!state.user || !list) return;
  const uid = state.user.uid;
  list.setAttribute("aria-busy", "true");
  list.replaceChildren(el("li", { class: "activity-item skeleton", "aria-hidden": "true" }));
  try {
    await requireFirebase();
    const { fs, db } = fb;
    const results = await Promise.allSettled(ACTIVITY_SOURCES.map((src) =>
      withTimeout(fs.getDocs(fs.query(fs.collection(db, src.col), fs.where("userId", "==", uid), fs.limit(10))), CONFIG.READ_TIMEOUT_MS)
        .then((snap) => snap.docs.map((d) => ({ src, data: d.data() })))));
    if (state.user?.uid !== uid) return;
    if (results.every((r) => r.status === "rejected")) throw results[0].reason;
    const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => (toDate(b.data.createdAt)?.getTime() || 0) - (toDate(a.data.createdAt)?.getTime() || 0))
      .slice(0, 20);
    list.replaceChildren(...(items.length ? items.map(({ src, data }) => el("li", { class: "activity-item" },
      el("div", {}, el("strong", { text: t(src.label) }), " · ", src.summary(data)),
      el("span", { text: fmtDate(data.createdAt, true) }))) : [el("li", { class: "empty-inline", text: t("act_empty") })]));
  } catch (e) {
    console.warn("Activity unavailable:", e?.code || e?.message);
    list.replaceChildren(el("li", { class: "empty-inline error-state", text: t("act_error") }));
  } finally {
    list.setAttribute("aria-busy", "false");
  }
}

function subscribeRequests(uid) {
  const { fs, db } = fb;
  state.requestsState = "loading";
  renderRequests();
  try {
    const q = fs.query(fs.collection(db, "pickupRequests"), fs.where("userId", "==", uid), fs.limit(50));
    state.unsubRequests = fs.onSnapshot(q, (snap) => {
      state.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() || Date.now()) - (toDate(a.createdAt)?.getTime() || Date.now()));
      state.requestsState = "ready";
      renderRequests();
    }, (err) => {
      console.warn("Requests listener error:", err?.code);
      state.requestsState = "error";
      renderRequests();
    });
  } catch (e) {
    state.requestsState = "error";
    renderRequests();
  }
}

const DASH_FILTERS = {
  all: () => true,
  active: (r) => ["requested", "confirmed", "assigned", "on_the_way", "collected"].includes(r.status),
  completed: (r) => r.status === "completed",
  cancelled: (r) => r.status === "cancelled"
};
function renderDashFilters() {
  const wrap = $("#dashFilters");
  wrap.replaceChildren(...Object.keys(DASH_FILTERS).map((k) => el("button", {
    class: "filter-chip", type: "button", "aria-pressed": String(state.dashFilter === k),
    onclick: () => { state.dashFilter = k; renderDashFilters(); renderRequests(); }
  }, t(`f_${k}`))));
}

function renderRequests() {
  const list = $("#reqList");
  if (!list || $("#dashboard").hidden) return;
  const completed = state.requests.filter((r) => r.status === "completed");
  $("#myCompleted").textContent = fmtNum(completed.length);
  $("#myKg").textContent = fmtNum(completed.reduce((s, r) => s + (Number(r.collectedWeightKg) || 0), 0), 1);

  if (state.requestsState === "loading") {
    list.setAttribute("aria-busy", "true");
    list.replaceChildren(...[1, 2].map(() => el("li", { class: "req-card skeleton", "aria-hidden": "true" })),
      el("li", { class: "sr-only", text: t("dash_loading") }));
    return;
  }
  list.setAttribute("aria-busy", "false");
  if (state.requestsState === "error") {
    list.replaceChildren(el("li", { class: "empty-state error-state" }, icon("alert"), el("p", { text: t("dash_error") })));
    return;
  }
  const items = state.requests.filter(DASH_FILTERS[state.dashFilter]);
  if (!items.length) {
    list.replaceChildren(el("li", { class: "empty-state" }, icon("box"),
      el("p", { text: state.requests.length ? t("dash_empty_filter") : t("dash_empty") }),
      state.requests.length ? null : el("div", { class: "btn-row btn-row--center" }, el("a", { class: "btn btn--primary btn--sm", href: "#book" }, t("book_now")))));
    return;
  }
  list.replaceChildren(...items.map((r) => {
    const code = clean(r.trackingCode, 20);
    const actions = el("div", { class: "req-card__actions" },
      el("button", { class: "btn btn--ghost btn--xs", type: "button", onclick: (e) => showRequestDetails(r, e.currentTarget) }, t("details")),
      el("button", { class: "btn btn--soft btn--xs", type: "button", onclick: () => rebook(r) }, icon("repeat"), el("span", { text: t("rebook") })),
      CANCELLABLE.includes(r.status) ? el("button", { class: "btn btn--danger btn--xs", type: "button", onclick: (e) => cancelRequest(r, e.currentTarget) }, t("cancel")) : null
    );
    return el("li", { class: "req-card" },
      el("div", { class: "req-card__top" }, el("span", { class: "req-card__code", text: code }), statusBadge(r.status)),
      el("div", { class: "req-card__meta" },
        el("span", { text: `${fmtDate(r.preferredDate)} · ${clean(r.preferredTime, 20)}` }),
        el("span", { text: clean(r.area, 60) }),
        el("span", { text: (Array.isArray(r.materials) ? r.materials : []).map(catName).join(", ") })),
      actions);
  }));
}

function receiptTable(rows, totalAmount, sample) {
  return el("div", { class: "receipt", style: "margin-top:16px" },
    sample ? el("p", { class: "receipt__stamp", text: t("sample_label") }) : null,
    el("table", { class: "receipt__table" },
      el("caption", { class: "sr-only", text: t("receipt_real") }),
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: t("material") }), el("th", { scope: "col", text: t("weight") }), el("th", { scope: "col", text: t("amount") }))),
      el("tbody", {}, ...rows.map((row) => el("tr", {}, el("td", { text: row[0] }), el("td", { text: row[1] }), el("td", { text: row[2] })))),
      el("tfoot", {}, el("tr", {}, el("th", { scope: "row", colspan: "2", text: t("total") }), el("td", { text: totalAmount })))));
}

function showRequestDetails(r, opener) {
  const rows = [
    ["rv_code", r.trackingCode], ["rv_status", t(`ps_${r.status}`)], ["rv_created", fmtDate(r.createdAt, true)],
    ["rv_schedule", `${fmtDate(r.preferredDate)} · ${r.preferredTime || ""}`], ["rv_alt", r.alternativeTime],
    ["rv_location", `${r.area || ""}${r.ward ? `, ${t("rv_ward")} ${fmtNum(r.ward)}` : ""}`], ["rv_landmark", r.landmark],
    ["rv_address", r.address], ["rv_phone", r.phone], ["rv_email", r.email],
    ["rv_materials", (r.materials || []).map(catName).join(", ")],
    ["rv_items", Array.isArray(r.materialItems) && r.materialItems.length ? r.materialItems.map((i) => `${clean(i.name, 60)} (${fmtNum(Number(i.qty) || 0, 1)} ${i.unit === "kg" ? t("unit_kg") : t("unit_pc")})`).join(", ") : null],
    ["rv_weight", r.estimatedWeight != null ? `${fmtNum(r.estimatedWeight, 1)} ${t("unit_kg")}` : null],
    ["rv_value", r.estimatedValue ? fmtRange(Number(r.estimatedValue.min) || 0, Number(r.estimatedValue.max) || 0) : null],
    ["rv_recurring", r.recurring && r.recurring !== "none" ? t(`r_${r.recurring}`) : null],
    ["rv_notes", r.notes]
  ].filter(([, v]) => v != null && v !== "");
  const body = $("#requestBody");
  const content = [el("dl", { class: "detail-list" }, ...rows.map(([k, v]) => el("div", {}, el("dt", { text: t(k) }), el("dd", { text: String(v).slice(0, 400) }))))];

  if (r.status === "completed" || r.status === "collected") {
    const final = Array.isArray(r.finalItems) ? r.finalItems : [];
    if (final.length && Number.isFinite(Number(r.finalAmount))) {
      content.push(receiptTable(final.slice(0, 30).map((i) => [clean(i.name, 60), `${fmtNum(Number(i.weightKg) || 0, 1)} ${t("unit_kg")}`, fmtRs(Number(i.amount) || 0)]), fmtRs(Number(r.finalAmount)), false));
    } else {
      content.push(el("p", { class: "notice", style: "margin-top:16px" }, icon("info"), el("span", { text: t("receipt_pending") })));
      content.push(receiptTable([[t("rv_materials"), `10 ${t("unit_kg")}`, fmtRs(180)], ["PET", `4 ${t("unit_kg")}`, fmtRs(100)]], fmtRs(280), true));
    }
  }
  body.replaceChildren(...content);
  openDialog("requestDialog", opener);
}

function rebook(r) {
  const set = (id, v) => { if (v != null) $(id).value = v; };
  set("#bkName", r.customerName); set("#bkEmail", r.email); set("#bkPhone", r.phone); set("#bkContact", r.contactMethod);
  set("#bkArea", r.area); set("#bkWard", r.ward); set("#bkLandmark", r.landmark); set("#bkAddress", r.address); set("#bkMap", r.mapLink || "");
  set("#bkWeight", r.estimatedWeight ?? ""); set("#bkQty", r.quantity ?? ""); set("#bkNotes", r.notes || "");
  set("#bkRecurring", r.recurring || "none");
  $("#bkDate").value = "";
  $("#bkTime").value = "";
  const mats = new Set(r.materials || []);
  $$("#bkMaterials input").forEach((c) => { c.checked = mats.has(c.value); });
  state.imported = null;
  renderImported();
  showStep(1);
  scrollToId("book");
  toast(t("rebook_ok"));
}

async function cancelRequest(r, btn) {
  const code = clean(r.trackingCode, 20);
  if (!CANCELLABLE.includes(r.status) || btn.disabled) return;
  if (!window.confirm(t("cancel_confirm", { code }))) return;
  setLoading(btn, true);
  try {
    await requireFirebase();
    const { fs, db } = fb;
    const ts = fs.serverTimestamp();
    const batch = fs.writeBatch(db);
    batch.update(fs.doc(db, "pickupRequests", r.id), { status: "cancelled", updatedAt: ts });
    const last4 = String(r.phone || "").slice(-4);
    if (code && /^\d{4}$/.test(last4)) batch.update(fs.doc(db, "pickupTracking", `${code}_${last4}`), { status: "cancelled", updatedAt: ts });
    await withTimeout(batch.commit(), CONFIG.WRITE_TIMEOUT_MS);
    toast(t("cancelled_ok", { code }));
  } catch (e) {
    toast(friendlyError(e), "error");
    setLoading(btn, false);
  }
}

/* ==========================================================================
   Business, community, contact forms
   ========================================================================== */
function initForms() {
  $("#bizForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitCreateForm(e.currentTarget, {
      collectionName: "businessInquiries",
      buildData: () => ({
        organizationName: clean($("#bzOrg").value, 100),
        organizationType: $("#bzType").value,
        contactPerson: clean($("#bzPerson").value, 80),
        phone: normalizePhone($("#bzPhone").value),
        email: clean($("#bzEmail").value, 120).toLowerCase() || null,
        area: clean($("#bzArea").value, 60),
        materialVolume: $("#bzVolume").value,
        frequency: $("#bzFreq").value,
        notes: cleanMultiline($("#bzMaterials").value, 600) || null,
        userId: state.user?.uid || null
      }),
      successMsg: () => t("biz_sent")
    });
  });
  $("#communityForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitCreateForm(e.currentTarget, {
      collectionName: "communityCampaigns",
      buildData: () => ({
        name: clean($("#cmName").value, 80),
        phone: normalizePhone($("#cmPhone").value),
        area: clean($("#cmArea").value, 60),
        preferredDay: $("#cmDay").value,
        userId: state.user?.uid || null
      }),
      successMsg: () => t("comm_sent")
    });
  });
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitCreateForm(e.currentTarget, {
      collectionName: "contactMessages",
      validate: () => {
        const ok = $("#ctEmail").value.trim() || $("#ctPhone").value.trim();
        if (!ok) { setFieldError($("#ctEmail"), t("v_contact_need")); $("#ctEmail").focus(); }
        return Boolean(ok);
      },
      buildData: () => ({
        name: clean($("#ctName").value, 80),
        email: clean($("#ctEmail").value, 120).toLowerCase() || null,
        phone: normalizePhone($("#ctPhone").value) || null,
        topic: $("#ctTopic").value,
        message: cleanMultiline($("#ctMsg").value, 1000),
        userId: state.user?.uid || null
      }),
      successMsg: () => t("contact_sent")
    });
  });
}

/* ==========================================================================
   Toolkit: impact estimator + reminders
   ========================================================================== */
function updateImpactEstimator() {
  const kg = Math.max(0, Math.min(100000, Number($("#impKg").value) || 0));
  const times = Number($("#impFreq").value) || 1;
  $("#impResult").textContent = fmtNum(kg * times, 1);
}

function nextWeekday(day, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (d.getDay() !== day) d.setDate(d.getDate() + 1);
  return d;
}
function updateReminderStatus(extra = "") {
  const node = $("#remStatus");
  if (!node) return;
  const rem = store.get("sc_reminder");
  let perm = "";
  if (!("Notification" in window)) perm = t("rem_perm_unsupported");
  else if (Notification.permission === "denied") perm = t("rem_perm_denied");
  else if (Notification.permission === "granted") perm = t("rem_perm_on");
  const main = rem?.next ? t("rem_next", { date: fmtDate(rem.next) }) : t("rem_none");
  node.textContent = [main, perm, extra].filter(Boolean).join(" ");
  if (rem) { $("#remFreq").value = String(rem.freq); $("#remDay").value = String(rem.day); }
}
function checkReminderDue() {
  const rem = store.get("sc_reminder");
  if (!rem?.next) return;
  const due = new Date(rem.next);
  if (Number.isNaN(due.getTime()) || Date.now() < due.getTime()) return;
  toast(t("rem_due"), "ok", { timeout: 10000, action: { label: t("go_book"), onClick: () => scrollToId("book") } });
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification("SafaCycle Chitwan", { body: t("rem_due") });
  } catch { /* some mobile browsers only allow notifications via a service worker */ }
  let next = due;
  while (next.getTime() <= Date.now()) next = new Date(next.getTime() + rem.freq * 86400000);
  store.set("sc_reminder", { ...rem, next: next.toISOString() });
  if (state.user) queueSync({ reminder: sanitizeReminder(store.get("sc_reminder")) });
  updateReminderStatus();
}
function initToolkit() {
  initTablist($(".tabs__list"));
  $("#impactForm").addEventListener("input", updateImpactEstimator);
  $("#impactForm").addEventListener("submit", (e) => e.preventDefault());
  $("#reminderForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const freq = Number($("#remFreq").value) || 30;
    const day = Number($("#remDay").value);
    const next = nextWeekday(day);
    next.setHours(8, 0, 0, 0);
    store.set("sc_reminder", { freq, day, next: next.toISOString() });
    if (state.user) queueSync({ reminder: sanitizeReminder(store.get("sc_reminder")) }, 0);
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
    toast(t("rem_saved"));
    updateReminderStatus();
  });
  $("#remClear").addEventListener("click", () => {
    store.remove("sc_reminder");
    if (state.user) queueSync({ reminder: null }, 0);
    toast(t("rem_off"));
    updateReminderStatus();
  });
  updateImpactEstimator();
  updateReminderStatus();
  setTimeout(checkReminderDue, 2500);
}

/* ==========================================================================
   Public impact counters (read once, only when visible)
   ========================================================================== */
function animateCount(node, value) {
  const final = fmtNum(value);
  if (prefersReducedMotion()) { node.textContent = final; return; }
  const start = performance.now();
  const dur = 1100;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    node.textContent = fmtNum(Math.round(value * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step); else node.textContent = final;
  };
  requestAnimationFrame(step);
}
function initCounters() {
  const section = $("#impact");
  const load = async () => {
    try {
      await requireFirebase();
      const { fs, db } = fb;
      const snap = await withTimeout(fs.getDoc(fs.doc(db, "publicStats", "summary")), CONFIG.READ_TIMEOUT_MS);
      if (!snap.exists()) return;
      const d = snap.data();
      $$("[data-counter]").forEach((node) => {
        const v = Number(d[node.dataset.counter]);
        if (Number.isFinite(v) && v > 0) animateCount(node, v);
      });
    } catch { /* keep "Launching soon" */ }
  };
  if (!("IntersectionObserver" in window)) { load(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
  }, { rootMargin: "200px" });
  io.observe(section);
}

/* ==========================================================================
   Safa Assistant (FAQ-first, AI as low-usage fallback)
   ========================================================================== */
const chat = {
  history: [],
  aiModel: null,
  aiUnavailable: !CONFIG.AI_ENABLED,
  busy: false,
  lastAi: 0
};
const PII_PATTERNS = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/,                         // email
  /(?:\+?977[\s-]?)?9[678]\d{8}/,                     // Nepal mobile
  /\d[\d\s-]{6,}\d/,                                  // long digit sequences (phones, IDs)
  /\b(password|passcode|otp|pin code|citizenship no)\b/i
];
const hasPII = (text) => PII_PATTERNS.some((re) => re.test(text));

function matchKB(text) {
  const q = ` ${normalizeText(text)} `;
  let best = null;
  let bestScore = 0;
  for (const entry of KB) {
    let score = 0;
    for (const key of entry.keys) {
      const k = normalizeText(key);
      if (!k) continue;
      if (entry.exact ? q.trim() === k || q.startsWith(` ${k} `) : q.includes(k.length <= 3 ? ` ${k} ` : k)) score += k.length > 5 ? 2 : 1;
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore > 0 ? best : null;
}

function saveChat() { store.set("sc_chat", chat.history.slice(-30), true); }
function renderMessage(m, animate = true) {
  const log = $("#chatLog");
  const node = el("div", { class: `msg msg--${m.r === "u" ? "user" : "bot"}` }, m.t);
  if (!animate) node.style.animation = "none";
  if (m.src) node.append(el("span", { class: "msg__src", text: m.src === "ai" ? t("chat_ai_src") : t("chat_faq_src") }));
  if (m.a) {
    node.append(el("div", { class: "msg__action" }, el("a", {
      class: "btn btn--soft btn--xs", href: m.a.href === "#account" ? "#top" : m.a.href,
      onclick: (e) => {
        if (m.a.href === "#account") { e.preventDefault(); openAccount($("#chatFab")); }
        if (window.matchMedia("(max-width: 479px)").matches) closeChat(false);
      }
    }, t(m.a.label))));
  }
  log.append(node);
  log.scrollTop = log.scrollHeight;
  return node;
}
function addMessage(r, text, extra = {}) {
  const m = { r, t: String(text).slice(0, 900), ...extra };
  chat.history.push(m);
  saveChat();
  renderMessage(m);
}
function renderChatChips() {
  const wrap = $("#chatChips");
  if (!wrap) return;
  wrap.replaceChildren(...CHAT_CHIPS.map((c) => el("button", {
    class: "chip", type: "button",
    onclick: () => {
      const entry = KB.find((k) => k.id === c.kb);
      addMessage("u", t(c.label));
      addMessage("b", entry[state.lang], { src: "faq", a: entry.action });
    }
  }, t(c.label))));
}
function setChatStatus(msg) { $("#chatStatus").textContent = msg || ""; }

async function getAiModel() {
  if (chat.aiModel) return chat.aiModel;
  await requireFirebase();
  const ai = await import(fbUrl("ai"));
  const instance = ai.getAI(fb.app, { backend: new ai.GoogleAIBackend() });
  chat.aiModel = ai.getGenerativeModel(instance, {
    model: CONFIG.AI_MODEL,
    systemInstruction: AI_SYSTEM_INSTRUCTION,
    generationConfig: { maxOutputTokens: 220, temperature: 0.3 }
  });
  return chat.aiModel;
}

async function askAI(question) {
  const count = store.get("sc_ai_count", 0, true);
  if (chat.aiUnavailable) { addMessage("b", `${t("chat_fallback")}`, { a: { href: "#faq", label: "go_faq" } }); return; }
  if (!navigator.onLine) { addMessage("b", t("chat_offline"), { a: { href: "#faq", label: "go_faq" } }); return; }
  if (count >= CONFIG.AI_MAX_REQUESTS_PER_SESSION) { addMessage("b", t("chat_limit"), { a: { href: "#contact", label: "go_contact" } }); return; }
  const wait = CONFIG.AI_COOLDOWN_MS - (Date.now() - chat.lastAi);
  if (wait > 0) { addMessage("b", t("chat_cooldown", { s: Math.ceil(wait / 1000) })); return; }

  chat.busy = true;
  chat.lastAi = Date.now();
  store.set("sc_ai_count", count + 1, true);
  $("#chatSend").disabled = true;
  const typing = el("div", { class: "msg msg--bot msg--typing", "aria-label": "…" }, el("span"), el("span"), el("span"));
  $("#chatLog").append(typing);
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
  try {
    const model = await getAiModel();
    const langNote = state.lang === "ne" ? "Reply in simple Nepali." : "Reply in simple English.";
    const result = await withTimeout(model.generateContent(`${langNote}\nVisitor question: ${question}`), CONFIG.AI_TIMEOUT_MS);
    const text = clean(result?.response?.text?.() || "", 700).replace(/[*#`_]{1,3}/g, "");
    typing.remove();
    if (!text) throw new Error("empty");
    addMessage("b", text, { src: "ai" });
  } catch (e) {
    typing.remove();
    console.warn("Assistant AI unavailable:", e?.code || e?.message);
    const code = String(e?.code || e?.message || "");
    if (!code.includes("timeout") && !code.includes("empty")) {
      chat.aiUnavailable = true;
      setChatStatus(t("chat_ai_off"));
    }
    addMessage("b", t("chat_fallback"), { a: { href: "#contact", label: "go_contact" } });
  } finally {
    chat.busy = false;
    $("#chatSend").disabled = false;
  }
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  if (text.length > CONFIG.CHAT_MAX_CHARS) { setChatStatus(t("chat_too_long")); return; }
  if (chat.busy) { setChatStatus(t("chat_busy")); return; }
  setChatStatus(chat.aiUnavailable && CONFIG.AI_ENABLED ? t("chat_ai_off") : "");
  input.value = "";
  $("#chatCount").textContent = "0";
  if (hasPII(text)) {
    addMessage("u", "[…]");
    addMessage("b", t("chat_pii"));
    return;
  }
  addMessage("u", text);
  const entry = matchKB(text);
  if (entry) { addMessage("b", entry[state.lang], { src: "faq", a: entry.action }); return; }
  await askAI(text);
}

function openChat() {
  const panel = $("#chatPanel");
  panel.hidden = false;
  $("#chatFab").setAttribute("aria-expanded", "true");
  $("#chatFab").hidden = true;
  if (!$("#chatLog").children.length) {
    if (chat.history.length) chat.history.forEach((m) => renderMessage(m, false));
    else addMessage("b", t("chat_welcome"));
  }
  if (chat.aiUnavailable && CONFIG.AI_ENABLED) setChatStatus(t("chat_ai_off"));
  $("#chatInput").focus();
}
function closeChat(restoreFocus = true) {
  $("#chatPanel").hidden = true;
  const fab = $("#chatFab");
  fab.hidden = false;
  fab.setAttribute("aria-expanded", "false");
  if (restoreFocus) fab.focus();
}
function initChat() {
  if (!CONFIG.ASSISTANT_ENABLED) {
    $("#chatFab").hidden = true;
    $$("[data-open-chat]").forEach((b) => { b.hidden = true; });
    return;
  }
  const saved = store.get("sc_chat", [], true);
  chat.history = Array.isArray(saved) ? saved.filter((m) => m && typeof m.t === "string" && (m.r === "u" || m.r === "b")).slice(-30) : [];
  renderChatChips();
  $("#chatFab").addEventListener("click", openChat);
  $$("[data-open-chat]").forEach((b) => b.addEventListener("click", openChat));
  $("#chatClose").addEventListener("click", () => closeChat());
  $("#chatClear").addEventListener("click", () => {
    chat.history = [];
    store.remove("sc_chat", true);
    $("#chatLog").replaceChildren();
    addMessage("b", t("chat_welcome"));
    setChatStatus(t("chat_cleared"));
  });
  $("#chatForm").addEventListener("submit", handleChatSubmit);
  $("#chatInput").addEventListener("input", (e) => { $("#chatCount").textContent = String(e.target.value.length); });
  $("#chatPanel").addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); });
}

/* ==========================================================================
   Boot
   ========================================================================== */
function init() {
  document.documentElement.classList.add("js");
  $("#year").textContent = String(new Date().getFullYear());
  $$("[data-lang-toggle]").forEach((b) => b.addEventListener("click", toggleLanguage));
  initDialogs();
  initScrollUI();
  slider.init();
  initCategoryCarousel();
  initOffline();
  initAccordion();
  initLiveValidation();
  initCoverage();
  initRates();
  initCalculator();
  initBooking();
  $("#trackForm").addEventListener("submit", handleTrack);
  initAuth();
  initForms();
  initToolkit();
  initCounters();
  initChat();
  renderDashFilters();
  applyLanguage();
  initRouter();
  firebaseReady.then(() => updateAuthHint());
  initAnalytics();
  window.addEventListener("pagehide", () => { if (state.unsubRequests) state.unsubRequests(); });
}

init();
