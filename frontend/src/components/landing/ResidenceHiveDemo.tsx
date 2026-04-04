import { useState, useEffect, useRef } from "react";

const SCENES = [
  { id: "wa", label: "STEP 1 · Agent sends voice note on WhatsApp" },
  { id: "wa", label: "STEP 2 · AI creates lead instantly" },
  { id: "wa", label: "STEP 3 · Generate buyer report in one message" },
  { id: "wa", label: "STEP 4 · Report approved & sent" },
  { id: "wa", label: "STEP 5 · Agent challenges the AI" },
  { id: "wa", label: "STEP 6 · AI explains constraints intelligently" },
  { id: "report", label: "STEP 7 · What the buyer receives" },
  { id: "report", label: "STEP 8 · AI flags concerns honestly" },
  { id: "report", label: "STEP 9 · Photo analysis catches hidden issues" },
  { id: "report", label: "STEP 10 · Side-by-side comparison" },
  { id: "chatbot", label: "STEP 11 · Buyer asks about schools" },
  { id: "chatbot", label: "STEP 12 · AI responds with compliant school data" },
  { id: "end", label: "VOICE NOTE → LEAD → REPORT → SHOWING · 60 SECONDS" },
];

// WhatsApp messages sequence
const WA_MSGS = [
  { type: "sent", scene: 0, content: "voice", transcript: `"Hey, I just met Ankita and Rohan. 3 bed condo in Quincy, 500 to 700K, garage, good schools."` },
  { type: "recv", scene: 1, content: "lead", data: {
    name: "Ankita & Rohan", loc: "Quincy", budget: "$500K–$700K",
    beds: "3", homeType: "Condo", features: "Garage, good schools", intent: "20"
  }},
  { type: "sent", scene: 2, content: "text", text: "generate a report" },
  { type: "recv", scene: 2, content: "noresults", text: `I couldn't find any properties matching Ankita and Rohan's criteria (Quincy, $500K–$700K, 3 beds).\n\nWould you like to try widening the budget or adding more locations?` },
  { type: "recv", scene: 3, content: "report", title: "Outreach report ready for Ankita and Rohan", link: "residencehive.com/buyer-report/11610f5a..." },
  { type: "sent", scene: 3, content: "text", text: "1" },
  { type: "recv", scene: 3, content: "text", text: "Got it. What should we update the budget to for Ankita and Rohan? Or would you like to add more locations?" },
  { type: "sent", scene: 4, content: "text", text: "Why are you not able to find what are the constraints?" },
  { type: "recv", scene: 5, content: "constraints", data: {
    loc: "Quincy", budget: "$500K – $700K", beds: "3", type: "Condo", garage: "Min 1 space",
    note: "Finding a 3-bedroom condo with a garage in Quincy under $700K is quite tight. Would you like to try removing the garage requirement or increasing the budget to $800K?"
  }},
];

function VoiceWave() {
  const bars = Array.from({ length: 26 }, (_, i) => ({
    h: Math.random() * 14 + 4,
    d: i * 0.03,
  }));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, height: 18 }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          width: 2.5, height: b.h, borderRadius: 2,
          background: "rgba(255,255,255,0.5)",
          animation: `vbAnim 0.6s ${b.d}s ease-in-out infinite alternate`,
        }} />
      ))}
    </div>
  );
}

function WaMsg({ msg, visible }) {
  if (!visible) return null;
  const isSent = msg.type === "sent";
  const base = {
    maxWidth: "88%", padding: "6px 8px 3px", borderRadius: 8, fontSize: 13,
    lineHeight: 1.4, color: "#e9edef",
    background: isSent ? "#005c4b" : "#1f2c34",
    alignSelf: isSent ? "flex-end" : "flex-start",
    borderTopLeftRadius: isSent ? 8 : 0,
    borderTopRightRadius: isSent ? 0 : 8,
    animation: "msgIn 0.3s ease forwards",
  };
  const time = `7:${String(36 + Math.floor(Math.random() * 4)).padStart(2, "0")} p.m.`;

  const renderContent = () => {
    if (msg.content === "voice") {
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
            <span style={{ fontSize: 13, color: "#fff" }}>▶</span>
            <VoiceWave />
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>0:21</span>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11
            }}>🧑‍💼</div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3, fontStyle: "italic" }}>
            🎙️ {msg.transcript}
          </div>
        </>
      );
    }
    if (msg.content === "lead") {
      const d = msg.data;
      return (
        <>
          <div>OK. I've added <b>{d.name}</b> to your leads.</div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "7px 8px", margin: "4px 0", fontSize: 12, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 2 }}>Lead Summary:</div>
            {[
              ["🧑", "Name", d.name], ["📍", "Location", d.loc], ["💰", "Budget", d.budget],
              ["🛏️", "Beds", `${d.beds} · Type: ${d.homeType}`],
              ["✨", "Features", d.features], ["🎯", "Intent", d.intent]
            ].map(([e, k, v], i) => (
              <div key={i} style={{ display: "flex", gap: 4 }}>
                <span style={{ width: 16, textAlign: "center", fontSize: 11 }}>{e}</span>
                <b>{k}:</b> {v}
              </div>
            ))}
          </div>
          <div>Search for matching properties?</div>
        </>
      );
    }
    if (msg.content === "report") {
      return (
        <div style={{ background: "rgba(0,168,132,0.08)", border: "1px solid rgba(0,168,132,0.2)", borderRadius: 8, padding: 9, margin: "4px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#00a884", textTransform: "uppercase", letterSpacing: 0.5 }}>📄 Outreach Approval</div>
          <div style={{ fontSize: 12.5, fontWeight: 500, margin: "3px 0 5px" }}>{msg.title}</div>
          <span style={{ fontSize: 11, color: "#53bdeb", wordBreak: "break-all", display: "block", marginBottom: 6 }}>🔗 {msg.link}</span>
          <div style={{ fontSize: 11, marginBottom: 6, color: "#aebac1" }}>Review, then approve to email.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: "#00a884", color: "#fff" }}>✓ Approve & Send</span>
            <span style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: "rgba(255,255,255,0.1)", color: "#aebac1" }}>Reject</span>
          </div>
        </div>
      );
    }
    if (msg.content === "constraints") {
      const d = msg.data;
      return (
        <>
          <div>The current constraints for <b>Ankita and Rohan</b> are:</div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "7px 8px", margin: "4px 0", fontSize: 12, lineHeight: 1.8 }}>
            {[["Location", d.loc], ["Budget", d.budget], ["Bedrooms", d.beds], ["Home Type", d.type], ["Garage", d.garage]].map(([k, v], i) => (
              <div key={i}>· <b>{k}:</b> {v}</div>
            ))}
          </div>
          <div style={{ marginTop: 4 }}>{d.note}</div>
        </>
      );
    }
    if (msg.content === "noresults") {
      return <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>;
    }
    return <div>{msg.text}</div>;
  };

  return (
    <div style={base}>
      {renderContent()}
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", textAlign: "right", marginTop: 2, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
        {time}{isSent && <span style={{ color: "#53bdeb", fontSize: 11 }}>✓✓</span>}
      </div>
    </div>
  );
}

function TypingDots({ color = "#8696a0" }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[0, 0.2, 0.4].map((d, i) => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: "50%", background: color,
          animation: `bounce 1.2s ${d}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

// Properties data
const PROPS = [
  { addr: "16 Littlefield St", price: "$567,000", beds: 4, baths: 2, sqft: "1,274", badge: "#1 TOP PICK", badgeColor: "#2563eb", strength: "Most beds" },
  { addr: "36 Palmer St", price: "$536,900", beds: 3, baths: 3, sqft: "968", badge: "#2 ALTERNATIVE", badgeColor: "#059669", strength: "Well-rounded" },
  { addr: "212-A Quincy Shore", price: "$488,000", beds: 2, baths: 1, sqft: "864", badge: "#3 OPTION", badgeColor: "#6366f1", strength: "Best price" },
  { addr: "27 Sixth Ave", price: "$499,000", beds: 3, baths: 1, sqft: "1,134", badge: "#4 OPTION", badgeColor: "#6366f1", strength: "Well-rounded" },
];

const SCHOOLS = [
  { prop: "16 Littlefield St", schools: [
    { name: "Atherton Hough Elementary", rating: "4/10", dist: "1.5 miles" },
    { name: "Broad Meadows Middle School", rating: "5/10", dist: "1.5 miles" },
    { name: "Quincy High School", rating: "5/10", dist: "2.5 miles" },
  ]},
  { prop: "36 Palmer St", schools: [
    { name: "Snug Harbor Community School", rating: "5/10", dist: "0.7 miles" },
    { name: "Broad Meadows Middle School", rating: "5/10", dist: "1.0 mile" },
  ]},
  { prop: "212-A Quincy Shore Dr", schools: [
    { name: "Squantum Elementary School", rating: "4/10", dist: "1.1 miles" },
    { name: "Atlantic Middle School", rating: "8/10", dist: "0.6 miles" },
    { name: "North Quincy High School", rating: "8/10", dist: "0.6 miles" },
  ]},
];

export default function ResidenceHiveDemo() {
  const [step, setStep] = useState(-1);
  const [visibleMsgs, setVisibleMsgs] = useState([]);
  const [showTyping, setShowTyping] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [view, setView] = useState("wa"); // wa, report, chatbot
  const [reportSections, setReportSections] = useState([]);
  const [cbMsgs, setCbMsgs] = useState([]);
  const [cbTyping, setCbTyping] = useState(false);
  const [finished, setFinished] = useState(false);
  const chatRef = useRef(null);
  const rptRef = useRef(null);
  const running = useRef(false);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runDemo() {
    if (running.current) return;
    running.current = true;
    setFinished(false);
    setVisibleMsgs([]);
    setShowTyping(false);
    setCurrentScene(0);
    setView("wa");
    setReportSections([]);
    setCbMsgs([]);
    setCbTyping(false);

    await sleep(500);

    // === WHATSAPP FLOW ===
    // Voice note
    setCurrentScene(0);
    await sleep(300);
    setVisibleMsgs((p) => [...p, 0]);
    await sleep(1800);

    // Lead created
    setShowTyping(true);
    await sleep(1500);
    setShowTyping(false);
    setCurrentScene(1);
    setVisibleMsgs((p) => [...p, 1]);
    await sleep(2000);

    // Generate report
    setCurrentScene(2);
    await sleep(400);
    setVisibleMsgs((p) => [...p, 2]);
    await sleep(1200);

    // No results + report anyway
    setShowTyping(true);
    await sleep(1800);
    setShowTyping(false);
    setVisibleMsgs((p) => [...p, 3]);
    await sleep(1000);
    setVisibleMsgs((p) => [...p, 4]);
    await sleep(1500);

    // Approve
    setCurrentScene(3);
    setVisibleMsgs((p) => [...p, 5]);
    await sleep(800);
    setShowTyping(true);
    await sleep(1000);
    setShowTyping(false);
    setVisibleMsgs((p) => [...p, 6]);
    await sleep(1500);

    // Agent pushback
    setCurrentScene(4);
    await sleep(400);
    setVisibleMsgs((p) => [...p, 7]);
    await sleep(1500);

    // Constraints response
    setShowTyping(true);
    await sleep(2000);
    setShowTyping(false);
    setCurrentScene(5);
    setVisibleMsgs((p) => [...p, 8]);
    await sleep(3000);

    // === REPORT VIEW ===
    setCurrentScene(6);
    setView("report");
    await sleep(800);

    const secs = ["intro", "disclosure", "props", "ai", "photos", "compare"];
    for (let i = 0; i < secs.length; i++) {
      await sleep(800);
      setReportSections((p) => [...p, secs[i]]);
      if (secs[i] === "ai") setCurrentScene(7);
      if (secs[i] === "photos") setCurrentScene(8);
      if (secs[i] === "compare") setCurrentScene(9);
      await sleep(600);
    }
    await sleep(2000);

    // === CHATBOT ===
    setCurrentScene(10);
    setView("chatbot");
    await sleep(800);

    setCbMsgs((p) => [...p, { type: "sent", text: "tell me about the schools" }]);
    await sleep(1200);

    setCbTyping(true);
    await sleep(2500);
    setCbTyping(false);
    setCurrentScene(11);
    setCbMsgs((p) => [...p, { type: "recv", content: "schools" }]);
    await sleep(4000);

    // End
    setCurrentScene(12);
    await sleep(3000);
    setFinished(true);
    running.current = false;
  }

  useEffect(() => { runDemo(); }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [visibleMsgs, showTyping]);

  const sceneText = currentScene >= 0 && currentScene < SCENES.length ? SCENES[currentScene].label : "";
  const isWide = view === "report";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes msgIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-3px)} }
        @keyframes vbAnim { 0%{opacity:0.4} 100%{opacity:1} }
      `}</style>

      {/* Scene Banner */}
      <div style={{
        height: 24, display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, marginBottom: 6,
        opacity: sceneText ? 1 : 0, transition: "opacity 0.5s",
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#00a884", boxShadow: "0 0 6px rgba(0,168,132,0.5)" }} />
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748b" }}>{sceneText}</span>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#00a884", boxShadow: "0 0 6px rgba(0,168,132,0.5)" }} />
      </div>

      {/* Phone Frame */}
      <div style={{
        width: isWide ? 780 : 370, height: 690,
        background: "#000", borderRadius: isWide ? 16 : 44, padding: 6,
        boxShadow: "0 0 0 1.5px #222, 0 30px 80px rgba(0,0,0,0.6)",
        transition: "all 0.8s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{
          width: "100%", height: "100%",
          background: view === "wa" ? "#0b141a" : "#fafbfc",
          borderRadius: isWide ? 12 : 40, overflow: "hidden",
          display: "flex", flexDirection: "column",
          transition: "border-radius 0.8s, background 0.5s",
        }}>

          {/* === WHATSAPP === */}
          {view === "wa" && (
            <>
              <div style={{ height: 44, background: "#1f2c34", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", fontSize: 13, color: "#fff", fontWeight: 600 }}>
                <span>7:36 PM</span><span style={{ fontSize: 11 }}>📶 🔋</span>
              </div>
              <div style={{ background: "#1f2c34", padding: "6px 12px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#00a884", fontSize: 20 }}>‹</span>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#00a884,#008f6f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", fontWeight: 700 }}>R</div>
                <div><div style={{ color: "#e9edef", fontSize: 15, fontWeight: 500 }}>ResidenceHive</div><div style={{ color: "#8696a0", fontSize: 11.5 }}>online</div></div>
              </div>
              <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                {WA_MSGS.map((msg, i) => (
                  <WaMsg key={i} msg={msg} visible={visibleMsgs.includes(i)} />
                ))}
                {showTyping && (
                  <div style={{ alignSelf: "flex-start", background: "#1f2c34", borderRadius: "0 8px 8px 8px", padding: "10px 14px" }}>
                    <TypingDots />
                  </div>
                )}
              </div>
              <div style={{ background: "#1f2c34", padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, background: "#2a3942", borderRadius: 20, padding: "8px 14px", color: "#8696a0", fontSize: 13 }}>Type a message</div>
                <div style={{ width: 34, height: 34, background: "#00a884", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎤</div>
              </div>
            </>
          )}

          {/* === REPORT === */}
          {view === "report" && (
            <>
              <div style={{ padding: "18px 22px 14px", borderBottom: "2px solid #2563eb", background: "#fff" }}>
                <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, fontWeight: 400, color: "#111", marginBottom: 2 }}>Property Recommendations for Ankita & Rohan</h1>
                <p style={{ fontSize: 12, color: "#64748b" }}>Curated by <span style={{ color: "#2563eb", fontWeight: 500 }}>Piyush Tiwari</span> · Quincy, MA</p>
              </div>
              <div ref={rptRef} style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
                {/* Intro */}
                {reportSections.includes("intro") && (
                  <div style={{ animation: "msgIn 0.4s ease forwards", marginBottom: 12 }}>
                    <div style={{ background: "#f0f7ff", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6, color: "#334155", borderLeft: "3px solid #2563eb" }}>
                      Hello! I've put together a preliminary list of properties in Quincy within your price range. While some might need work, I wanted to share a comprehensive overview to start our conversation.
                    </div>
                  </div>
                )}
                {/* Disclosure */}
                {reportSections.includes("disclosure") && (
                  <div style={{ animation: "msgIn 0.4s ease forwards", marginBottom: 12 }}>
                    <div style={{ background: "#fffbeb", borderRadius: 10, padding: "10px 14px", borderLeft: "3px solid #f59e0b" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b45309", marginBottom: 3 }}>Agency Disclosure</div>
                      <div style={{ fontSize: 11, color: "#92400e", lineHeight: 1.5 }}>Piyush Tiwari is acting as your Buyer's Agent. A written Buyer Representation Agreement is required prior to touring any property.</div>
                    </div>
                  </div>
                )}
                {/* Property Cards */}
                {reportSections.includes("props") && (
                  <div style={{ animation: "msgIn 0.4s ease forwards", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7, color: "#111" }}>Your Property Matches</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 9 }}>
                      {PROPS.map((p, i) => (
                        <div key={i} style={{
                          borderRadius: 10, overflow: "hidden", background: "#fff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0",
                          animation: `msgIn 0.35s ${i * 0.15}s ease forwards`, opacity: 0,
                        }}>
                          <div style={{ height: 80, background: `linear-gradient(135deg, ${p.badgeColor}22, ${p.badgeColor}11)`, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 28 }}>🏠</span>
                            <div style={{ position: "absolute", top: 5, left: 5, padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#fff", background: p.badgeColor }}>{p.badge}</div>
                          </div>
                          <div style={{ padding: "7px 9px" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{p.price}</div>
                            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 1 }}>🛏 {p.beds} 🛁 {p.baths} 📐 {p.sqft}</div>
                            <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 1 }}>📍 {p.addr}, Quincy</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* AI Analysis */}
                {reportSections.includes("ai") && (
                  <div style={{ animation: "msgIn 0.4s ease forwards", marginBottom: 12 }}>
                    <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111", marginBottom: 6 }}>🏠 #1 Top Pick · 16 Littlefield St</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                        {[
                          ["✕ No garage", "#fef2f2", "#dc2626"],
                          ["✕ Residential (wanted Condo)", "#fef2f2", "#dc2626"],
                          ["⚠ Built 1920", "#fffbeb", "#d97706"],
                          ["✓ 19% under budget", "#f0fdf4", "#16a34a"],
                          ["✓ +1 bed", "#f0fdf4", "#16a34a"],
                        ].map(([t, bg, c], i) => (
                          <span key={i} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 9.5, fontWeight: 600, background: bg, color: c }}>{t}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "#475569", padding: "7px 9px", background: "#f8fafc", borderRadius: 6, borderLeft: "3px solid #2563eb" }}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: "#2563eb", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Agent's Take</div>
                        The photos show visible water stains in kitchen and sunroom, and it doesn't have the garage you want. This 1920 Colonial is priced well under at $567K with 4 beds and beach access, but will need significant updates.
                      </div>
                    </div>
                  </div>
                )}
                {/* Photos */}
                {reportSections.includes("photos") && (
                  <div style={{ animation: "msgIn 0.4s ease forwards", marginBottom: 12 }}>
                    <div style={{ background: "#f0f9ff", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0c4a6e", marginBottom: 5 }}>📷 What We Saw in Photos</div>
                      <div style={{ fontSize: 10.5, color: "#475569", marginBottom: 4 }}>2 highlights, 2 items to verify</div>
                      {[
                        ["✅", "Original hardwood floors and recessed lighting"],
                        ["✅", "Multiple windows for ample natural light"],
                        ["⚠️", "Water stains on ceiling in kitchen area"],
                        ["⚠️", "Water stains on ceiling of enclosed porch"],
                      ].map(([icon, text], i) => (
                        <div key={i} style={{ fontSize: 11, color: "#334155", padding: "2px 0", display: "flex", alignItems: "center", gap: 4 }}>{icon} {text}</div>
                      ))}
                      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 5, fontStyle: "italic" }}>AI-generated. Verify in person.</div>
                    </div>
                  </div>
                )}
                {/* Compare */}
                {reportSections.includes("compare") && (
                  <div style={{ animation: "msgIn 0.4s ease forwards", marginBottom: 12 }}>
                    <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" }}>
                      <div style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: 700, borderBottom: "1px solid #e2e8f0" }}>📊 Compare Properties</div>
                      <table style={{ width: "100%", fontSize: 10.5, borderCollapse: "collapse" }}>
                        <thead>
                          <tr>{["", "#1 Littlefield", "#2 Palmer", "#3 Quincy Shore", "#4 Sixth Ave"].map((h, i) => (
                            <th key={i} style={{ background: "#f8fafc", padding: "5px 7px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 9.5 }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {[
                            ["Price", "$567K", "$537K", "$488K ⭐", "$499K"],
                            ["Beds", "4 ⭐", "3", "2", "3"],
                            ["Baths", "2", "3 ⭐", "1", "1"],
                            ["Schools", "2", "7", "11 ⭐", "8"],
                            ["Strength", "Most beds", "Well-rounded", "Best price", "Well-rounded"],
                          ].map((row, i) => (
                            <tr key={i}>{row.map((c, j) => (
                              <td key={j} style={{ padding: "4px 7px", borderBottom: "1px solid #f1f5f9", color: "#334155", fontWeight: j === 0 ? 600 : 400 }}>{c}</td>
                            ))}</tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", gap: 5, justifyContent: "center", padding: "7px 12px 10px", flexWrap: "wrap" }}>
                        {PROPS.map((p, i) => (
                          <button key={i} style={{ padding: "5px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>📅 Schedule #{i + 1}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* === CHATBOT === */}
          {view === "chatbot" && (
            <>
              <div style={{ padding: "14px 18px 10px", background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>🤖</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>ResidenceHive AI Assistant</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Ask about any property</div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {cbMsgs.map((msg, i) => {
                  const isSent = msg.type === "sent";
                  if (msg.content === "schools") {
                    return (
                      <div key={i} style={{
                        maxWidth: "92%", padding: "10px 14px", borderRadius: "12px 12px 12px 2px",
                        fontSize: 12.5, lineHeight: 1.5, background: "#f1f5f9", color: "#334155",
                        alignSelf: "flex-start", animation: "msgIn 0.3s ease forwards",
                      }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginBottom: 8 }}>
                          School assignments must be verified with the district. Proximity does not guarantee enrollment.
                        </div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Here's a summary of nearby public schools for each property you're considering in Quincy, MA:</div>
                        {SCHOOLS.map((group, gi) => (
                          <div key={gi} style={{ marginBottom: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: "#111", marginBottom: 3 }}>{group.prop}</div>
                            {group.schools.map((s, si) => (
                              <div key={si} style={{ paddingLeft: 8, borderLeft: "2px solid #e2e8f0", marginBottom: 3 }}>
                                <div style={{ fontWeight: 600, fontSize: 11.5, color: "#1e293b" }}>{s.name}</div>
                                <div style={{ fontSize: 10.5, color: "#64748b" }}>{s.rating} · approx. {s.dist}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div style={{ fontSize: 9.5, color: "#94a3b8", fontStyle: "italic", marginTop: 4 }}>
                          Source: GreatSchools/Zillow. Ratings and distances are approximate.
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} style={{
                      maxWidth: "85%", padding: "8px 12px",
                      borderRadius: isSent ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      fontSize: 12.5, lineHeight: 1.5,
                      background: isSent ? "#2563eb" : "#f1f5f9",
                      color: isSent ? "#fff" : "#334155",
                      alignSelf: isSent ? "flex-end" : "flex-start",
                      animation: "msgIn 0.3s ease forwards",
                    }}>
                      {msg.text}
                    </div>
                  );
                })}
                {cbTyping && (
                  <div style={{ alignSelf: "flex-start", background: "#f1f5f9", borderRadius: "12px 12px 12px 2px", padding: "10px 14px" }}>
                    <TypingDots color="#94a3b8" />
                  </div>
                )}
              </div>
              <div style={{ background: "#fff", padding: "8px 12px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 20, padding: "8px 14px", color: "#64748b", fontSize: 12.5 }}>Ask a question...</div>
              </div>
            </>
          )}
        </div>
      </div>

      {finished && (
        <button onClick={() => { setFinished(false); runDemo(); }} style={{
          marginTop: 8, background: "transparent", color: "#64748b", border: "1px solid #e2e8f0",
          padding: "6px 16px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>↻ Replay</button>
      )}
    </div>
  );
}
