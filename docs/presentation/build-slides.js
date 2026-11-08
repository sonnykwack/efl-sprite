const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fs = require("fs");
const md = require("react-icons/md");
const { applyTheme } = require("./apply_theme.js");

const OUT = process.argv[2];
const ICON_DIR = "/home/claude/efl-sprite/src-tauri/icons";

const THEME = {
  name: "EFL Sprite",
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  colors: {
    dk1: "14211B", // ink
    lt1: "FFFFFF",
    dk2: "127450", // deep green
    lt2: "F2FBF6", // mint tint
    accent1: "22B57A", // sprite green
    accent2: "8FDCB4",
    accent3: "6D5BD0", // violet (teacher)
    accent4: "E8A33D", // amber (caps / warnings)
    accent5: "4B5B53",
    accent6: "DCF5E7",
    hlink: "179463",
    folHlink: "127450",
  },
};

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10 x 5.625
  pres.author = "곽태훈 (Taehoon Kwack)";
  pres.title = "EFL Sprite — 졸업 프로젝트 시연";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---------- layouts
  pres.defineSlideMaster({
    title: "DARK",
    background: { color: C.text1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.7, w: 8.8, h: 1.0, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 2.8, w: 8.8, h: 0.8, fontSize: 18, color: C.accent2, valign: "top", align: "left", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.background1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 8.8, h: 0.75, fontSize: 26, bold: true, color: C.text1, valign: "middle", align: "left", margin: 0 }, text: "" } },
      { text: { text: "EFL Sprite · 곽태훈 32210214", options: { x: 0.6, y: 5.25, w: 5, h: 0.25, fontSize: 9, color: C.accent5, margin: 0 } } },
    ],
    slideNumber: { x: 9.0, y: 5.25, w: 0.4, h: 0.25, fontSize: 9, color: C.accent5, align: "right" },
  });

  const logo = "image/png;base64," + fs.readFileSync(`${ICON_DIR}/128x128@2x.png`).toString("base64");

  // helper: icon in a green circle
  const circleIcon = async (slide, Comp, x, y, d, fill = C.accent6, iconColor = THEME.colors.dk2, name = "icon") => {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: `${name}-circle` });
    const p = d * 0.22;
    slide.addImage({ data: await icon(Comp, iconColor), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: `${name}-icon` });
  };

  // ================= 1. Title
  pres.addSection({ title: "도입" });
  let s = pres.addSlide({ masterName: "DARK", sectionTitle: "도입" });
  s.addImage({ data: logo, x: 0.6, y: 0.65, w: 0.95, h: 0.95, objectName: "app-icon" });
  s.addText("EFL Sprite", { placeholder: "title" });
  s.addText("인터넷 없이 내 PC에서 돌아가는 영어 스피킹·라이팅 AI 코치", { placeholder: "body" });
  s.addText("단국대학교 소프트웨어학과 졸업 프로젝트  ·  곽태훈 (32210214)  ·  2026", {
    x: 0.6, y: 4.75, w: 8.8, h: 0.35, fontSize: 12, color: C.background2, margin: 0, isTextBox: true, objectName: "byline",
  });
  s.addNotes("안녕하세요. 단국대학교 소프트웨어학과 32210214 곽태훈입니다. 제 졸업 프로젝트 EFL Sprite는 인터넷 없이 내 PC 안에서 돌아가는 영어 스피킹·라이팅 AI 코치입니다. 먼저 왜 만들었는지 짧게 설명드리고, 실제 앱 시연을 보여드리겠습니다.");

  // ================= 2. Problem
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "도입" });
  s.addText("말하기·쓰기 연습은 강사의 첨삭 시간에 묶여 있습니다", { placeholder: "title" });
  const pains = [
    [md.MdHourglassBottom, "피드백 병목", "에세이·녹음 한 편마다 강사 첨삭이 필요해 학생은 며칠씩 기다리고, 연습량이 강사 시간에 묶입니다."],
    [md.MdAutorenew, "2026 TOEFL 개편", "Listen and Repeat, Interview, Email, Academic Discussion — 새 유형을 연습하고 채점받을 도구가 거의 없습니다."],
    [md.MdCloudOff, "클라우드 AI의 한계", "답안과 목소리를 서버로 보내야 하고, 구독료가 들며, '왜 이 점수인지' 설명하지 못합니다."],
  ];
  for (let i = 0; i < 3; i++) {
    const x = 0.6 + i * 3.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.45, w: 2.75, h: 3.45, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: "none" }, objectName: `pain-card-${i + 1}` });
    await circleIcon(s, pains[i][0], x + 0.3, 1.75, 0.75, C.accent6, THEME.colors.dk2, `pain-${i + 1}`);
    s.addText(pains[i][1], { x: x + 0.3, y: 2.7, w: 2.2, h: 0.45, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: `pain-title-${i + 1}` });
    s.addText(pains[i][2], { x: x + 0.3, y: 3.2, w: 2.2, h: 1.55, fontSize: 12, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: `pain-text-${i + 1}` });
  }
  s.addNotes("저는 영어 학원에서 TOEFL을 가르치고 있습니다. 읽기와 듣기는 정답이 있어 혼자 연습할 수 있지만, 말하기와 쓰기는 강사가 한 편씩 첨삭해야 해서 학생은 피드백을 오래 기다립니다. 게다가 2026년 TOEFL이 개편되면서 새 유형이 생겼지만 연습 도구는 거의 없고, 기존 AI 서비스는 학생의 글과 목소리를 서버로 보내야 하며 점수의 근거를 설명하지 못합니다.");

  // ================= 3. Solution
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "도입" });
  s.addText("학생은 즉시 근거 있는 피드백을, 강사는 검토만", { placeholder: "title" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.45, w: 3.6, h: 3.45, rectRadius: 0.12, fill: { color: C.text2 }, line: { type: "none" }, objectName: "solution-panel" });
  s.addText(
    [
      { text: "EFL Sprite", options: { fontSize: 24, bold: true, color: C.background1, breakLine: true } },
      { text: "TOEFL iBT 2026 형식의 스피킹·라이팅을 연습하면, 내 PC 안의 AI가 바로 채점하고 학생 본인의 문장을 근거로 첨삭합니다. 강사는 AI 결과를 검토하고 바로잡습니다.", options: { fontSize: 14, color: C.accent6 } },
    ],
    { x: 0.9, y: 1.75, w: 3.0, h: 2.9, valign: "top", margin: 0, paraSpaceAfter: 10, isTextBox: true, objectName: "solution-text" },
  );
  const pillars = [
    [md.MdLock, "온디바이스 AI", "음성 인식·채점·문법 교정이 모두 PC 안에서 실행 — 데이터가 밖으로 나가지 않음"],
    [md.MdAssignment, "시험 형식 그대로", "TOEFL 2026 4개 유형을 타이머와 함께, 문제는 AI 생성·파일 공유"],
    [md.MdRateReview, "근거 + 교사 협업", "점수마다 인용 근거, 클릭하면 이유 — 교사 첨삭이 AI보다 우선"],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 1.5 + i * 1.15;
    await circleIcon(s, pillars[i][0], 4.6, y, 0.7, C.accent6, THEME.colors.dk2, `pillar-${i + 1}`);
    s.addText(pillars[i][1], { x: 5.5, y: y - 0.02, w: 3.9, h: 0.35, fontSize: 16, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: `pillar-title-${i + 1}` });
    s.addText(pillars[i][2], { x: 5.5, y: y + 0.33, w: 3.9, h: 0.6, fontSize: 12, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: `pillar-text-${i + 1}` });
  }
  s.addNotes("그래서 EFL Sprite를 만들었습니다. 핵심은 세 가지입니다. 첫째, 모든 AI가 PC 안에서 실행되어 학생 데이터가 밖으로 나가지 않습니다. 둘째, TOEFL 2026의 네 가지 유형을 실제 시험처럼 연습할 수 있습니다. 셋째, 점수마다 학생 본인의 문장을 근거로 보여주고, 강사가 AI의 첨삭을 검토하고 바로잡을 수 있습니다.");

  // ================= 4. Architecture
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "도입" });
  s.addText("규칙 · 문법 모델 · LLM이 역할을 나눠 채점합니다", { placeholder: "title" });
  const box = (x, y, w, h, title, sub, fill, txt, name) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { type: "none" }, objectName: `${name}-box` });
    s.addText(
      [
        { text: title, options: { fontSize: 13, bold: true, color: txt, breakLine: true } },
        { text: sub, options: { fontSize: 10, color: txt } },
      ],
      { x: x + 0.1, y, w: w - 0.2, h, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `${name}-text` },
    );
  };
  const arrow = (x1, y1, x2, y2, name) =>
    s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: THEME.colors.accent5, width: 1.25, endArrowType: "triangle" }, objectName: name });
  box(0.6, 2.55, 1.35, 1.0, "학생 답안", "글 · 음성→Whisper", C.background2, C.text1, "in");
  box(2.35, 1.4, 1.75, 0.85, "규칙 검사", "조각문·어조·모호 어휘", C.accent6, C.text2, "rules");
  box(2.35, 2.6, 1.75, 0.85, "GECToR", "학습자 문법 교정 모델", C.accent6, C.text2, "gec");
  box(2.35, 3.8, 1.75, 0.85, "언어 지표", "어휘 다양성·복문·오류 밀도", C.accent6, C.text2, "feat");
  box(4.5, 2.4, 1.6, 1.25, "로컬 LLM", "근거 인용 → 점수\nJSON 스키마 강제", C.text2, C.background1, "llm");
  box(6.5, 2.4, 1.35, 1.25, "검증·보정", "인용 스냅·재검증\n상한·일관성", C.accent6, C.text2, "check");
  box(8.2, 1.55, 1.2, 1.0, "결과 화면", "한국어 피드백", C.accent1, C.background1, "out");
  box(8.2, 3.5, 1.2, 1.0, "교사 첨삭", "✓ / ✗ / 수정", C.accent3, C.background1, "teacher");
  arrow(1.95, 2.9, 2.35, 1.85, "a1");
  arrow(1.95, 3.05, 2.35, 3.05, "a2");
  arrow(1.95, 3.2, 2.35, 4.2, "a3");
  arrow(4.1, 3.0, 4.5, 3.0, "a4");
  arrow(4.1, 1.85, 6.5, 2.6, "a5");
  arrow(6.1, 3.0, 6.5, 3.0, "a6");
  arrow(7.85, 2.8, 8.2, 2.1, "a7");
  arrow(8.8, 2.55, 8.8, 3.5, "a8");
  s.addText("문법은 문법 모델과 규칙이, 내용·논리는 LLM이 판단 — 맞는 문장에 붙는 가짜 교정을 구조적으로 줄였습니다.", {
    x: 0.6, y: 4.75, w: 8.8, h: 0.35, fontSize: 12, italic: true, color: C.text2, margin: 0, isTextBox: true, objectName: "arch-caption",
  });
  s.addNotes("채점은 한 모델에 맡기지 않고 역할을 나눴습니다. 문법 오류는 학습자 영어로 학습한 GECToR 모델과 규칙 검사가 찾고, 어휘 다양성이나 문장 구조 같은 언어 지표는 코드가 직접 측정합니다. 로컬 LLM은 이 정보를 받아 내용과 논리를 판단하는데, 반드시 학생 문장을 먼저 인용한 뒤에 점수를 내도록 출력 형식을 강제했습니다. 마지막으로 인용 위치 보정, 재검증, 상한 규칙을 거쳐 한국어 피드백으로 보여주고, 강사는 그 결과를 검토할 수 있습니다.");

  // ================= 5. Demo divider
  pres.addSection({ title: "시연" });
  s = pres.addSlide({ masterName: "DARK", sectionTitle: "시연" });
  s.addText("앱 시연", { placeholder: "title" });
  s.addText("처음 실행부터 교사 첨삭까지, 실제 화면으로 보여드립니다", { placeholder: "body" });
  const steps = ["시작하기 · 모델 받기", "문제 공유 · AI 생성", "라이팅 응시 · 채점", "교정 이유 · 언어 지표", "교사 직접 첨삭", "스피킹 · 기록"];
  for (let i = 0; i < 6; i++) {
    const x = 0.6 + (i % 3) * 2.95;
    const y = 3.75 + Math.floor(i / 3) * 0.6;
    s.addShape(pres.shapes.OVAL, { x, y, w: 0.42, h: 0.42, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `step-dot-${i + 1}` });
    s.addText(String(i + 1), { x, y, w: 0.42, h: 0.42, fontSize: 13, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `step-num-${i + 1}` });
    s.addText(steps[i], { x: x + 0.55, y, w: 2.3, h: 0.42, fontSize: 13, color: C.background1, valign: "middle", margin: 0, isTextBox: true, objectName: `step-text-${i + 1}` });
  }
  s.addNotes("이제 실제 앱을 보여드리겠습니다. 처음 실행 화면부터 문제 준비, 라이팅 채점, 교정 설명, 교사 첨삭, 스피킹과 기록 순서로 진행합니다.");

  // ================= 6. Results
  pres.addSection({ title: "결과" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "결과" });
  s.addText("현직 강사 판단과 평균 0.44밴드 차이로 채점합니다", { placeholder: "title" });
  const stats = [
    ["0.44", "평균 절대 오차 (밴드)", "블라인드 채점 8건 기준"],
    ["75%", "±0.5 밴드 이내 일치", "8건 중 6건"],
    ["4 / 4", "토론 글 정확히 일치", "Academic Discussion"],
    ["4.0→2.5", "과대평가 사례 교정", "55단어 명령조 이메일 (교사 1.5)"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = 0.6 + i * 2.25;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.5, w: 2.05, h: 2.35, rectRadius: 0.12, fill: { color: i === 3 ? C.accent6 : C.background2 }, line: { type: "none" }, objectName: `stat-card-${i + 1}` });
    s.addText(stats[i][0], { x: x + 0.15, y: 1.7, w: 1.75, h: 0.9, fontSize: i === 3 ? 28 : 40, bold: true, color: C.text2, align: "left", valign: "middle", margin: 0, isTextBox: true, objectName: `stat-value-${i + 1}` });
    s.addText(stats[i][1], { x: x + 0.15, y: 2.7, w: 1.75, h: 0.5, fontSize: 13, bold: true, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: `stat-label-${i + 1}` });
    s.addText(stats[i][2], { x: x + 0.15, y: 3.2, w: 1.75, h: 0.5, fontSize: 10, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: `stat-note-${i + 1}` });
  }
  s.addText(
    [
      { text: "안정성: ", options: { bold: true, color: C.text1 } },
      { text: "같은 답안 반복 채점 시 항목 점수 표준편차 0.94(v1) → 0.00(하이브리드).  ", options: { color: C.accent5 } },
      { text: "근거 일치율: ", options: { bold: true, color: C.text1 } },
      { text: "67% → 96%(인용 스냅).", options: { color: C.accent5 } },
    ],
    { x: 0.6, y: 4.1, w: 8.8, h: 0.4, fontSize: 12, margin: 0, isTextBox: true, objectName: "stability" },
  );
  s.addText("※ 기준은 ETS 공식 채점이 아닌 현직 강사 1인의 블라인드 판단(예비 결과). 최종 검증은 조정에 쓰지 않은 새 답안으로 진행합니다.", {
    x: 0.6, y: 4.6, w: 8.8, h: 0.4, fontSize: 10, color: C.accent5, margin: 0, isTextBox: true, objectName: "caveat",
  });
  s.addNotes("채점 품질은 제가 강사로서 블라인드로 채점한 점수와 비교했습니다. 8건 기준 평균 차이는 0.44밴드, 0.5밴드 이내 일치가 75%였고, 토론 글은 네 건 모두 정확히 일치했습니다. 같은 답안을 여러 번 채점했을 때의 흔들림도 표준편차 0.94에서 0으로 줄었습니다. 다만 이 기준은 ETS 공식 채점이 아니라 강사 한 명의 판단이라 예비 결과이고, 최종 검증은 새 답안으로 진행합니다.");

  // ================= 7. Roles & iteration
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "결과" });
  s.addText("현직 강사의 판단이 설계를 바꿨습니다", { placeholder: "title" });
  const roles = [
    [md.MdLightbulb, "문제 정의 · 기획", "현장 문제, 4개 유형, 온디바이스·스토어 방향"],
    [md.MdDesignServices, "요구사항 · UX", "교사 첨삭 화면, 카톡·USB 문제 공유"],
    [md.MdFactCheck, "채점 기준 · 검증", "기준 답안·블라인드 채점, 문제 발견"],
    [md.MdBugReport, "테스트 · 배포", "실기기 디버깅, Partner Center 등록"],
  ];
  for (let i = 0; i < 4; i++) {
    const y = 1.45 + i * 0.85;
    await circleIcon(s, roles[i][0], 0.6, y, 0.55, C.accent6, THEME.colors.dk2, `role-${i + 1}`);
    s.addText(roles[i][1], { x: 1.3, y: y - 0.03, w: 2.9, h: 0.3, fontSize: 14, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: `role-title-${i + 1}` });
    s.addText(roles[i][2], { x: 1.3, y: y + 0.28, w: 2.9, h: 0.3, fontSize: 11, color: C.accent5, margin: 0, isTextBox: true, objectName: `role-text-${i + 1}` });
  }
  const changes = [
    ["\"점수가 후하다\"", "보정 앵커 · 상한 · 환산표 → 4.0이 2.5로"],
    ["\"전문 문법 모델이 필요하다\"", "GECToR 도입 → 심은 오류 7/7 검출"],
    ["\"맞는 문장에 가짜 교정\"", "문법은 문법 모델, LLM 교정은 재검증"],
    ["\"교사가 AI를 바로잡아야\"", "교사 첨삭 페이지 + AI 교정 정확도 측정"],
  ];
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.5, y: 1.4, w: 4.9, h: 3.4, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: "none" }, objectName: "changes-panel" });
  s.addText("내가 지적한 문제 → 바뀐 설계", { x: 4.75, y: 1.55, w: 4.4, h: 0.35, fontSize: 13, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: "changes-title" });
  for (let i = 0; i < 4; i++) {
    const y = 2.0 + i * 0.7;
    s.addText(
      [
        { text: changes[i][0], options: { bold: true, color: C.text1, breakLine: true } },
        { text: changes[i][1], options: { color: C.accent5 } },
      ],
      { x: 4.75, y, w: 4.4, h: 0.62, fontSize: 12, margin: 0, valign: "top", isTextBox: true, objectName: `change-${i + 1}` },
    );
  }
  s.addText("구현은 AI 코딩 도구(Claude Code)를 활용했고, 기획·기준·검증·테스트·배포는 본인이 수행했습니다.", {
    x: 0.6, y: 4.85, w: 8.8, h: 0.3, fontSize: 10, color: C.accent5, margin: 0, isTextBox: true, objectName: "ai-disclosure",
  });
  s.addNotes("이 프로젝트에서 저는 문제 정의와 기획, 요구사항 설계, 채점 기준과 검증, 테스트와 스토어 등록을 맡았고, 구현은 AI 코딩 도구를 활용했습니다. AI 채점의 품질은 무엇이 맞는 채점인지 아는 사람이 결과를 보고 고쳐야 올라갑니다. 예를 들어 제가 점수가 후하다고 지적해 보정 체계가 들어갔고, 전문 문법 모델이 필요하다고 판단해 GECToR를 도입했으며, 교사가 AI를 바로잡을 수 있어야 한다는 요구로 교사 첨삭 페이지를 만들었습니다.");

  // ================= 8. Engineering & Store
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "결과" });
  s.addText("Mac에서 개발하고, Windows 스토어로 배포합니다", { placeholder: "title" });
  const eng = [
    [md.MdStorefront, "Microsoft Store · MSIX", "유료 인증서 없이 Microsoft가 서명 — 마이크·엔진 실행 권한 선언, 패키지 57 MB"],
    [md.MdSync, "두 OS 동시 빌드", "모든 변경마다 macOS·Windows 자동 빌드와 스토어 패키지 생성(GitHub Actions)"],
    [md.MdTranslate, "한글 사용자 폴더 대응", "C:\\Users\\홍길동 경로에서 C++ 엔진이 실패하지 않도록 상대·ASCII 경로 전달"],
    [md.MdMic, "녹음 형식 직접 처리", "WebView2·Safari 차이를 피해 16 kHz WAV를 직접 인코딩, 무음 제거"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = 0.6 + (i % 2) * 4.5;
    const y = 1.45 + Math.floor(i / 2) * 1.7;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.3, h: 1.5, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: "none" }, objectName: `eng-card-${i + 1}` });
    await circleIcon(s, eng[i][0], x + 0.25, y + 0.3, 0.65, C.accent6, THEME.colors.dk2, `eng-${i + 1}`);
    s.addText(eng[i][1], { x: x + 1.1, y: y + 0.22, w: 3.0, h: 0.35, fontSize: 14, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: `eng-title-${i + 1}` });
    s.addText(eng[i][2], { x: x + 1.1, y: y + 0.6, w: 3.0, h: 0.75, fontSize: 11, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: `eng-text-${i + 1}` });
  }
  s.addNotes("개발은 Mac에서, 배포는 Windows 스토어로 했습니다. 일반 설치 파일은 유료 코드 서명 인증서가 필요하지만 MSIX 패키지는 Microsoft가 직접 서명해 주기 때문에 이 방식을 택했습니다. 모든 변경은 두 운영체제에서 자동으로 빌드되고, 한글 사용자 이름 경로나 브라우저 엔진별 녹음 형식 차이 같은 Windows 특유의 문제도 미리 처리했습니다.");

  // ================= 9. Limits & next
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "결과" });
  s.addText("한계와 다음 단계", { placeholder: "title" });
  const col = (x, title, items, Comp, name) => {
    s.addText(title, { x: x + 0.65, y: 1.5, w: 3.6, h: 0.45, fontSize: 18, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: `${name}-title` });
    s.addText(
      items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
      { x, y: 2.15, w: 4.2, h: 2.7, fontSize: 14, color: C.accent5, paraSpaceAfter: 8, valign: "top", margin: 0, isTextBox: true, objectName: `${name}-list` },
    );
    return circleIcon(s, Comp, x, 1.5, 0.45, C.accent6, THEME.colors.dk2, name);
  };
  await col(0.6, "한계", ["발음은 평가하지 않음 (음성 인식 결과로 채점)", "음성 인식이 학습자 발화를 '고쳐서' 받아 적을 수 있음", "교사 점수 8건 — 환산표·지표 기준은 임시값", "채점 속도가 PC 성능에 좌우 (7B 기준 40–70초)"], md.MdInfoOutline, "limits");
  await col(5.2, "다음 단계", ["조정에 쓰지 않은 새 답안 + ETS 기준표로 최종 검증", "강사 2인 채점으로 사람 간 일치도와 비교", "발음 평가 모델 연동", "교사 첨삭 데이터로 채점 자동 보정"], md.MdTrendingUp, "next");
  s.addNotes("한계도 분명합니다. 발음은 평가하지 않고, 음성 인식이 학생의 틀린 발화를 고쳐서 받아 적을 수 있으며, 교사 점수 데이터가 아직 8건이라 기준값은 임시입니다. 다음 단계로 새 답안과 ETS 기준표로 최종 검증을 하고, 강사 두 명의 채점과 비교하며, 교사 첨삭 데이터로 채점을 자동 보정할 계획입니다.");

  // ================= 10. Closing
  pres.addSection({ title: "마무리" });
  s = pres.addSlide({ masterName: "DARK", sectionTitle: "마무리" });
  s.addImage({ data: logo, x: 0.6, y: 0.65, w: 0.8, h: 0.8, objectName: "app-icon-end" });
  s.addText("감사합니다", { placeholder: "title" });
  s.addText("github.com/sonnykwack/efl-sprite  ·  Microsoft Store: EFL Sprite", { placeholder: "body" });
  s.addText("곽태훈 (32210214) · 단국대학교 소프트웨어학과\nTOEFL은 ETS의 등록 상표이며, 이 앱은 ETS와 관련이 없습니다. 개발에 AI 코딩 도구(Claude Code)를 활용했습니다.", {
    x: 0.6, y: 4.45, w: 8.8, h: 0.7, fontSize: 10, color: C.background2, margin: 0, valign: "bottom", isTextBox: true, objectName: "closing-notes",
  });
  s.addNotes("EFL Sprite는 학생에게는 즉시 근거 있는 피드백을, 강사에게는 검토와 협업의 도구를 주는 온디바이스 AI 코치입니다. 코드와 개발 기록은 GitHub에 공개되어 있고, Microsoft Store에서 받을 수 있습니다. 감사합니다.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
