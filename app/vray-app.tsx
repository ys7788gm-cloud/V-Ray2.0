"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { INDUSTRIES, INDUSTRY_GROUPS, SOURCE_NOTE, type Industry } from "./industry-data";

type Method = "income" | "royalty1" | "royalty2";
type InputTab = "basic" | "technology" | "finance";
type OutputTab = "summary" | "cashflow" | "evidence";
type ScoreMap = Record<string, number>;

type ModelState = {
  projectName: string;
  industryId: string;
  method: Method;
  baseSales: number;
  growthRate: number;
  costMode: "industry" | "direct";
  costRatio: number;
  sgaRatio: number;
  depreciationRatio: number;
  capexRatio: number;
  workingCapitalRatio: number;
  taxRate: number;
  tctMode: "industry" | "direct";
  directTct: number;
  legalLife: number;
  lifeScores: ScoreMap;
  techScores: ScoreMap;
  techShare: number;
  discountMode: "industry" | "capm" | "direct";
  directWacc: number;
  riskFreeRate: number;
  marketPremium: number;
  beta: number;
  kd: number;
  equityRatio: number;
  projectRisk: number;
  discountTiming: "mid" | "end";
  royaltyAdjustment: number;
  royaltyQuartile: "q1" | "q2" | "q3";
  ipEffectiveness: number;
};

const LIFE_FACTORS = [
  ["substitution", "대체기술 출현 속도"],
  ["market", "시장 성장성과 수요 지속성"],
  ["barrier", "후발주자 진입장벽"],
  ["ip", "권리 보호범위와 회피 난이도"],
  ["complement", "보완자산·인허가·표준"],
] as const;

const TECH_FACTORS = [
  ["superiority", "기술 우월성"],
  ["differentiation", "차별성"],
  ["completion", "완성도"],
  ["protection", "권리 보호강도"],
  ["expandability", "확장·응용 가능성"],
  ["marketFit", "시장 적합성"],
  ["commercial", "사업화 준비도"],
  ["dependence", "매출의 기술 의존도"],
] as const;

const METHOD_LABEL: Record<Method, string> = {
  income: "수익접근법",
  royalty1: "로열티공제법 1",
  royalty2: "로열티공제법 2",
};

const MODE_LABEL = { direct: "직접통계", composite: "합성프로파일", proxy: "분류선행·대체값" };

function initialState(industry: Industry): ModelState {
  return {
    projectName: "기능성 식품 기술가치평가",
    industryId: industry.id,
    method: "income",
    baseSales: 5000,
    growthRate: industry.growthRate,
    costMode: "industry",
    costRatio: industry.costRatio,
    sgaRatio: industry.sgaRatio,
    depreciationRatio: industry.depreciationRatio,
    capexRatio: industry.capexRatio,
    workingCapitalRatio: industry.workingCapitalRatio,
    taxRate: 0.209,
    tctMode: "industry",
    directTct: industry.baseTct,
    legalLife: 20,
    lifeScores: Object.fromEntries(LIFE_FACTORS.map(([key]) => [key, 0])),
    techScores: Object.fromEntries(TECH_FACTORS.map(([key]) => [key, 3])),
    techShare: 0.8,
    discountMode: "industry",
    directWacc: industry.wacc,
    riskFreeRate: 0.02209,
    marketPremium: 0.0891,
    beta: industry.beta,
    kd: industry.kd,
    equityRatio: industry.equityRatio,
    projectRisk: 0,
    discountTiming: "mid",
    royaltyAdjustment: 1,
    royaltyQuartile: "q2",
    ipEffectiveness: 1,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function fmtPct(value: number, digits = 1) {
  return `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function fmtMoney(millionWon: number) {
  const won = millionWon * 1_000_000;
  if (Math.abs(won) >= 1_000_000_000_000) return `${fmtNum(won / 1_000_000_000_000, 2)}조 원`;
  if (Math.abs(won) >= 100_000_000) return `${fmtNum(won / 100_000_000, 1)}억 원`;
  return `${fmtNum(millionWon, 0)}백만원`;
}

function PctInput({ value, onChange, min = -20, max = 100, step = 0.1 }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <div className="input-with-unit"><input type="number" value={Number((value * 100).toFixed(3))} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value) / 100)} /><span>%</span></div>;
}

function NumberInput({ value, onChange, min = 0, max, step = 1, unit }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return <div className="input-with-unit"><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />{unit && <span>{unit}</span>}</div>;
}

function Metric({ label, value, tone = "plain", note }: { label: string; value: string; tone?: "plain" | "accent" | "warm"; note?: string }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export default function VrayApp() {
  const defaultIndustry = INDUSTRIES.find((item) => item.id === "EV33") ?? INDUSTRIES[0];
  const [model, setModel] = useState<ModelState>(() => initialState(defaultIndustry));
  const [inputTab, setInputTab] = useState<InputTab>("basic");
  const [outputTab, setOutputTab] = useState<OutputTab>("summary");
  const [advanced, setAdvanced] = useState(false);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const industry = INDUSTRIES.find((item) => item.id === model.industryId) ?? INDUSTRIES[0];

  const analysis = useMemo(() => {
    const lifeImpact = Object.values(model.lifeScores).reduce((sum, score) => sum + score, 0);
    const baseTct = model.tctMode === "industry" ? industry.baseTct : model.directTct;
    const adjustedLife = Math.round(baseTct * (1 + lifeImpact / 20));
    const life = clamp(adjustedLife, 1, Math.min(model.legalLife, 20));
    const techStrength = clamp(average(Object.values(model.techScores)) / 5, 0, 1);
    const contribution = clamp(techStrength * industry.industryTechFactor * model.techShare, 0, 1);
    const costRatio = model.costMode === "industry" ? industry.costRatio : model.costRatio;
    const sgaRatio = model.costMode === "industry" ? industry.sgaRatio : model.sgaRatio;
    const depreciationRatio = model.costMode === "industry" ? industry.depreciationRatio : model.depreciationRatio;
    const capexRatio = model.costMode === "industry" ? industry.capexRatio : model.capexRatio;
    const workingCapitalRatio = model.costMode === "industry" ? industry.workingCapitalRatio : model.workingCapitalRatio;
    const capmKe = model.riskFreeRate + model.beta * model.marketPremium;
    const capmWacc = capmKe * model.equityRatio + model.kd * (1 - model.taxRate) * (1 - model.equityRatio);
    const waccBase = model.discountMode === "industry" ? industry.wacc : model.discountMode === "capm" ? capmWacc : model.directWacc;
    const wacc = clamp(waccBase + model.projectRisk, 0.001, 0.5);
    const qRate = model.royaltyQuartile === "q1" ? industry.runningRoyaltyQ1 : model.royaltyQuartile === "q3" ? industry.runningRoyaltyQ3 : industry.runningRoyaltyQ2;
    const royaltyRate1 = clamp(industry.runningRoyaltyQ2 * model.royaltyAdjustment * model.techShare, 0, 0.25);
    const royaltyRate2 = clamp(qRate * model.ipEffectiveness * model.techShare, 0, 0.25);
    const rows = [];
    let previousSales = model.baseSales / Math.max(1 + model.growthRate, 0.01);
    for (let year = 1; year <= life; year += 1) {
      const sales = model.baseSales * Math.pow(1 + model.growthRate, year - 1);
      const grossProfit = sales * (1 - costRatio);
      const ebit = sales * (1 - costRatio - sgaRatio);
      const tax = Math.max(ebit, 0) * model.taxRate;
      const noplat = ebit - tax;
      const depreciation = sales * depreciationRatio;
      const capex = sales * capexRatio;
      const workingCapitalIncrease = (sales - previousSales) * workingCapitalRatio;
      const fcf = noplat + depreciation - capex - workingCapitalIncrease;
      const royaltyBase1 = sales * royaltyRate1 * (1 - model.taxRate);
      const royaltyBase2 = sales * royaltyRate2 * (1 - model.taxRate);
      const exponent = model.discountTiming === "mid" ? year - 0.5 : year;
      const discountFactor = 1 / Math.pow(1 + wacc, exponent);
      const technologyCash = model.method === "income" ? fcf * contribution : model.method === "royalty1" ? royaltyBase1 : royaltyBase2;
      rows.push({ year, sales, grossProfit, ebit, tax, noplat, depreciation, capex, workingCapitalIncrease, fcf, technologyCash, discountFactor, presentValue: technologyCash * discountFactor });
      previousSales = sales;
    }
    const technologyValue = rows.reduce((sum, row) => sum + row.presentValue, 0);
    const warnings: string[] = [];
    if (costRatio + sgaRatio >= 1) warnings.push("매출원가율과 판관비율의 합이 100% 이상입니다.");
    if (industry.dataGrade === "C") warnings.push("이 업종은 독립 실측통계가 부족해 대체값을 사용합니다.");
    if (industry.runningRoyaltyCount < 5 && model.method !== "income") warnings.push("경상로열티 표본이 5건 미만입니다. 범위 분석을 병행하세요.");
    if (model.legalLife < adjustedLife) warnings.push("기술수명이 법적 잔존기간으로 제한되었습니다.");
    if (technologyValue < 0) warnings.push("산출 기술가치가 음수입니다. 사업계획과 비용구조를 재검토하세요.");
    return { lifeImpact, baseTct, adjustedLife, life, techStrength, contribution, costRatio, sgaRatio, depreciationRatio, capexRatio, workingCapitalRatio, capmKe, wacc, royaltyRate1, royaltyRate2, rows, technologyValue, warnings };
  }, [industry, model]);

  const setField = <K extends keyof ModelState>(key: K, value: ModelState[K]) => setModel((current) => ({ ...current, [key]: value }));

  const selectIndustry = (id: string) => {
    const next = INDUSTRIES.find((item) => item.id === id) ?? INDUSTRIES[0];
    setModel((current) => ({ ...current, industryId: id, growthRate: next.growthRate, costRatio: next.costRatio, sgaRatio: next.sgaRatio, depreciationRatio: next.depreciationRatio, capexRatio: next.capexRatio, workingCapitalRatio: next.workingCapitalRatio, directTct: next.baseTct, directWacc: next.wacc, beta: next.beta, kd: next.kd, equityRatio: next.equityRatio }));
  };

  const applyScenario = (scenario: "conservative" | "base" | "optimistic") => {
    const delta = scenario === "conservative" ? -0.02 : scenario === "optimistic" ? 0.02 : 0;
    setModel((current) => ({ ...current, growthRate: clamp(industry.growthRate + delta, -0.2, 0.5), projectRisk: scenario === "conservative" ? 0.02 : 0, royaltyAdjustment: scenario === "conservative" ? 0.85 : scenario === "optimistic" ? 1.15 : 1 }));
    setNotice(scenario === "conservative" ? "보수 시나리오를 적용했습니다." : scenario === "optimistic" ? "낙관 시나리오를 적용했습니다." : "업종 기준값으로 복원했습니다.");
  };

  const saveScenario = () => {
    localStorage.setItem("vray-2.0-scenario", JSON.stringify(model));
    setNotice("이 기기에 평가 시나리오를 저장했습니다.");
  };

  const loadScenario = () => {
    const saved = localStorage.getItem("vray-2.0-scenario");
    if (!saved) return setNotice("저장된 시나리오가 없습니다.");
    try { setModel(JSON.parse(saved)); setNotice("저장된 시나리오를 불러왔습니다."); } catch { setNotice("저장 파일을 읽지 못했습니다."); }
  };

  const exportScenario = () => {
    const blob = new Blob([JSON.stringify({ version: "2.0.0", exportedAt: new Date().toISOString(), model }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `V-RAY_${model.projectName || "scenario"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importScenario = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const candidate = parsed.model ?? parsed;
        if (!INDUSTRIES.some((item) => item.id === candidate.industryId)) throw new Error("industry");
        setModel(candidate);
        setNotice("시나리오 파일을 불러왔습니다.");
      } catch { setNotice("올바른 V-RAY 2.0 시나리오 파일이 아닙니다."); }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const chartPoints = useMemo(() => {
    const values = analysis.rows.map((row) => row.sales);
    const max = Math.max(...values, 1);
    return values.map((value, index) => `${30 + (index / Math.max(values.length - 1, 1)) * 540},${160 - (value / max) * 120}`).join(" ");
  }, [analysis.rows]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">V</span><div><strong>V-RAY 2.0</strong><small>Agri-Food Technology Valuation</small></div></div>
        <div className="top-actions">
          <button className="button ghost" onClick={saveScenario}>저장</button>
          <button className="button ghost" onClick={loadScenario}>불러오기</button>
          <button className="button ghost desktop-only" onClick={exportScenario}>JSON 내보내기</button>
          <button className="button primary" onClick={() => window.print()}>평가서 인쇄</button>
          <input ref={importRef} hidden type="file" accept="application/json" onChange={importScenario} />
        </div>
      </header>

      <section className="hero-band">
        <div><span className="eyebrow">PUBLIC BETA · V 2.0.0</span><h1>근거가 보이는<br />기술가치평가.</h1><p>73개 농식품·스마트농업·푸드테크 업종의 핵심변수와 V-RAY 평가논리를 브라우저에서 바로 계산합니다.</p></div>
        <div className="hero-status"><span className="pulse" /><div><small>MODEL STATUS</small><strong>{analysis.warnings.some((item) => item.includes("100%") || item.includes("음수")) ? "REVIEW" : "PASS"}</strong><p>{INDUSTRIES.length}개 업종 · {analysis.life}년 현금흐름 · 실시간 계산</p></div></div>
      </section>

      {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}

      <section className="scenario-strip no-print"><span>빠른 시나리오</span><button onClick={() => applyScenario("conservative")}>보수적</button><button onClick={() => applyScenario("base")}>기준</button><button onClick={() => applyScenario("optimistic")}>낙관적</button><span className="scenario-note">성장률·위험프리미엄·로열티 조정계수를 함께 변경합니다.</span></section>

      <div className="workspace">
        <section className="input-panel no-print">
          <div className="panel-heading"><div><span className="section-index">01</span><h2>평가정보 입력</h2></div><label className="toggle"><input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /><span />고급 옵션</label></div>
          <div className="tabs" role="tablist">
            <button className={inputTab === "basic" ? "active" : ""} onClick={() => setInputTab("basic")}>기본정보</button>
            <button className={inputTab === "technology" ? "active" : ""} onClick={() => setInputTab("technology")}>수명·기여도</button>
            <button className={inputTab === "finance" ? "active" : ""} onClick={() => setInputTab("finance")}>재무·할인율</button>
          </div>

          {inputTab === "basic" && <div className="form-stack">
            <label className="field"><span>평가과제명</span><input type="text" value={model.projectName} onChange={(e) => setField("projectName", e.target.value)} /></label>
            <label className="field"><span>평가업종 <em>{industry.id}</em></span><select value={model.industryId} onChange={(e) => selectIndustry(e.target.value)}>{INDUSTRY_GROUPS.map((group) => <optgroup key={group} label={group}>{INDUSTRIES.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</optgroup>)}</select></label>
            <div className="industry-preview"><div><span className={`grade grade-${industry.dataGrade}`}>{industry.dataGrade}</span><strong>{industry.name}</strong></div><p>{industry.definition}</p><small>{MODE_LABEL[industry.statMode]} · 재무통계 등가표본수 {fmtNum(industry.sample, 0)}</small></div>
            <fieldset><legend>평가방법</legend><div className="choice-grid">{(["income", "royalty1", "royalty2"] as Method[]).map((method) => <button key={method} className={model.method === method ? "choice active" : "choice"} onClick={() => setField("method", method)}><strong>{METHOD_LABEL[method]}</strong><span>{method === "income" ? "초과현금흐름 × 기술기여도" : method === "royalty1" ? "경상로열티 × 조정계수" : "사분위 로열티 × IP 유효성"}</span></button>)}</div></fieldset>
            <label className="field"><span>1차년도 예상 매출액</span><NumberInput value={model.baseSales} min={0} step={100} unit="백만원" onChange={(value) => setField("baseSales", value)} /></label>
            <label className="field"><span>연평균 매출 성장률 <em>업종 기준 {fmtPct(industry.growthRate)}</em></span><PctInput value={model.growthRate} min={-20} max={50} onChange={(value) => setField("growthRate", value)} /></label>
            {model.method === "royalty1" && <label className="field"><span>로열티 조정계수</span><PctInput value={model.royaltyAdjustment} min={50} max={150} step={1} onChange={(value) => setField("royaltyAdjustment", value)} /></label>}
            {model.method === "royalty2" && <><label className="field"><span>적용 사분위</span><select value={model.royaltyQuartile} onChange={(e) => setField("royaltyQuartile", e.target.value as ModelState["royaltyQuartile"])}><option value="q1">Q1 · {fmtPct(industry.runningRoyaltyQ1, 2)}</option><option value="q2">Q2 중위수 · {fmtPct(industry.runningRoyaltyQ2, 2)}</option><option value="q3">Q3 · {fmtPct(industry.runningRoyaltyQ3, 2)}</option></select></label><label className="field"><span>지식재산 유효성 조정</span><PctInput value={model.ipEffectiveness} min={50} max={150} step={1} onChange={(value) => setField("ipEffectiveness", value)} /></label></>}
          </div>}

          {inputTab === "technology" && <div className="form-stack">
            <fieldset><legend>기술수명 기준</legend><div className="segmented"><button className={model.tctMode === "industry" ? "active" : ""} onClick={() => setField("tctMode", "industry")}>업종 TCT {industry.baseTct}년</button><button className={model.tctMode === "direct" ? "active" : ""} onClick={() => setField("tctMode", "direct")}>직접 입력</button></div></fieldset>
            {model.tctMode === "direct" && <label className="field"><span>기준 TCT</span><NumberInput value={model.directTct} min={1} max={20} unit="년" onChange={(value) => setField("directTct", value)} /></label>}
            <label className="field"><span>법적 잔존기간</span><NumberInput value={model.legalLife} min={1} max={20} unit="년" onChange={(value) => setField("legalLife", value)} /></label>
            <fieldset><legend>기술수명 영향요인 <em>합계 {analysis.lifeImpact > 0 ? "+" : ""}{analysis.lifeImpact}점</em></legend><div className="score-list">{LIFE_FACTORS.map(([key, label]) => <label key={key}><span>{label}</span><select value={model.lifeScores[key]} onChange={(e) => setField("lifeScores", { ...model.lifeScores, [key]: Number(e.target.value) })}><option value={-2}>-2 매우 불리</option><option value={-1}>-1 불리</option><option value={0}>0 보통</option><option value={1}>+1 유리</option><option value={2}>+2 매우 유리</option></select></label>)}</div></fieldset>
            <div className="formula-callout"><span>적용 기술수명</span><strong>{analysis.life}년</strong><small>{analysis.baseTct} × (1 + {analysis.lifeImpact}/20), 법적 잔존기간 상한</small></div>
            <fieldset><legend>기술기여도 평가정보 <em>{fmtPct(analysis.techStrength, 0)}</em></legend><div className="score-list compact">{TECH_FACTORS.map(([key, label]) => <label key={key}><span>{label}</span><select value={model.techScores[key]} onChange={(e) => setField("techScores", { ...model.techScores, [key]: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((score) => <option value={score} key={score}>{score}점</option>)}</select></label>)}</div></fieldset>
            <label className="field"><span>평가대상 기술의 사업기여 비중</span><PctInput value={model.techShare} min={0} max={100} step={1} onChange={(value) => setField("techShare", value)} /></label>
            <div className="formula-callout accent"><span>최종 기술기여도</span><strong>{fmtPct(analysis.contribution, 1)}</strong><small>{fmtPct(analysis.techStrength, 0)} × 산업기술요소 {fmtPct(industry.industryTechFactor, 1)} × 기술비중 {fmtPct(model.techShare, 0)}</small></div>
          </div>}

          {inputTab === "finance" && <div className="form-stack">
            <fieldset><legend>재무비율 적용</legend><div className="segmented"><button className={model.costMode === "industry" ? "active" : ""} onClick={() => setField("costMode", "industry")}>업종 통계</button><button className={model.costMode === "direct" ? "active" : ""} onClick={() => setField("costMode", "direct")}>직접 입력</button></div></fieldset>
            <div className="two-col"><label className="field"><span>매출원가율</span><PctInput value={model.costMode === "industry" ? industry.costRatio : model.costRatio} min={0} max={100} onChange={(value) => setField("costRatio", value)} /></label><label className="field"><span>판관비율</span><PctInput value={model.costMode === "industry" ? industry.sgaRatio : model.sgaRatio} min={0} max={100} onChange={(value) => setField("sgaRatio", value)} /></label><label className="field"><span>감가상각비율</span><PctInput value={model.costMode === "industry" ? industry.depreciationRatio : model.depreciationRatio} min={0} max={30} onChange={(value) => setField("depreciationRatio", value)} /></label><label className="field"><span>자본적지출률</span><PctInput value={model.costMode === "industry" ? industry.capexRatio : model.capexRatio} min={0} max={30} onChange={(value) => setField("capexRatio", value)} /></label><label className="field"><span>운전자본소요율</span><PctInput value={model.costMode === "industry" ? industry.workingCapitalRatio : model.workingCapitalRatio} min={-20} max={50} onChange={(value) => setField("workingCapitalRatio", value)} /></label><label className="field"><span>법인세율</span><PctInput value={model.taxRate} min={0} max={50} onChange={(value) => setField("taxRate", value)} /></label></div>
            <fieldset><legend>할인율 산정</legend><div className="segmented three"><button className={model.discountMode === "industry" ? "active" : ""} onClick={() => setField("discountMode", "industry")}>업종 WACC</button><button className={model.discountMode === "capm" ? "active" : ""} onClick={() => setField("discountMode", "capm")}>CAPM</button><button className={model.discountMode === "direct" ? "active" : ""} onClick={() => setField("discountMode", "direct")}>직접</button></div></fieldset>
            {model.discountMode === "direct" && <label className="field"><span>직접 입력 WACC</span><PctInput value={model.directWacc} min={0.1} max={50} onChange={(value) => setField("directWacc", value)} /></label>}
            {model.discountMode === "capm" && <div className="two-col"><label className="field"><span>무위험이자율</span><PctInput value={model.riskFreeRate} min={0} max={20} onChange={(value) => setField("riskFreeRate", value)} /></label><label className="field"><span>시장위험프리미엄</span><PctInput value={model.marketPremium} min={0} max={30} onChange={(value) => setField("marketPremium", value)} /></label><label className="field"><span>베타</span><NumberInput value={model.beta} min={0} max={5} step={0.01} onChange={(value) => setField("beta", value)} /></label><label className="field"><span>타인자본비용</span><PctInput value={model.kd} min={0} max={30} onChange={(value) => setField("kd", value)} /></label><label className="field"><span>자기자본비율</span><PctInput value={model.equityRatio} min={0} max={100} onChange={(value) => setField("equityRatio", value)} /></label><div className="formula-mini"><span>CAPM Ke</span><strong>{fmtPct(analysis.capmKe, 2)}</strong></div></div>}
            <label className="field"><span>사업화 위험프리미엄</span><PctInput value={model.projectRisk} min={0} max={20} onChange={(value) => setField("projectRisk", value)} /></label>
            <label className="field"><span>할인시점</span><select value={model.discountTiming} onChange={(e) => setField("discountTiming", e.target.value as ModelState["discountTiming"])}><option value="mid">기중 할인</option><option value="end">기말 할인</option></select></label>
            <div className="formula-callout warm"><span>최종 할인율</span><strong>{fmtPct(analysis.wacc, 2)}</strong><small>{model.discountMode === "industry" ? `업종 WACC ${fmtPct(industry.wacc, 2)}` : model.discountMode === "capm" ? "CAPM 가중자본비용" : "직접 입력"} + 위험프리미엄</small></div>
            {advanced && <details open className="advanced-box"><summary>업종 회전율·자산구성 확인</summary><dl><div><dt>총자산회전율</dt><dd>{fmtNum(industry.assetTurnover, 2)}회</dd></div><div><dt>재고자산회전율</dt><dd>{fmtNum(industry.inventoryTurnover, 2)}회</dd></div><div><dt>매출채권회전율</dt><dd>{fmtNum(industry.receivableTurnover, 2)}회</dd></div><div><dt>매입채무회전율</dt><dd>{fmtNum(industry.payableTurnover, 2)}회</dd></div><div><dt>유형자산비중</dt><dd>{fmtPct(industry.tangibleAssetRatio)}</dd></div><div><dt>무형자산비중</dt><dd>{fmtPct(industry.intangibleAssetRatio)}</dd></div></dl></details>}
          </div>}
          <div className="mobile-next"><button className="button primary" onClick={() => setInputTab(inputTab === "basic" ? "technology" : inputTab === "technology" ? "finance" : "basic")}>{inputTab === "finance" ? "기본정보로" : "다음 입력"}</button></div>
        </section>

        <section className="output-panel print-surface">
          <div className="report-header"><div><span className="section-index">02</span><h2>기술가치평가 결과</h2><p>{model.projectName || "평가과제"}</p></div><span className={`status-pill ${analysis.warnings.length ? "caution" : "pass"}`}>{analysis.warnings.length ? `주의 ${analysis.warnings.length}` : "검증 통과"}</span></div>
          <div className="headline-value"><span>산출 기술가치</span><strong>{fmtMoney(analysis.technologyValue)}</strong><small>{METHOD_LABEL[model.method]} · {industry.name} · 평가기준일 {new Date().toLocaleDateString("ko-KR")}</small></div>
          <div className="metric-grid"><Metric label="기술수명" value={`${analysis.life}년`} note={`기준 TCT ${analysis.baseTct}년`} /><Metric label="기술기여도" value={fmtPct(analysis.contribution, 1)} tone="accent" note={`개별기술강도 ${fmtPct(analysis.techStrength, 0)}`} /><Metric label="할인율" value={fmtPct(analysis.wacc, 2)} tone="warm" note={model.discountMode === "industry" ? "업종 WACC 기반" : model.discountMode === "capm" ? "CAPM 기반" : "직접입력"} /></div>
          {analysis.warnings.length > 0 && <div className="warning-box"><strong>합리성 검토</strong><ul>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <div className="tabs output-tabs no-print" role="tablist"><button className={outputTab === "summary" ? "active" : ""} onClick={() => setOutputTab("summary")}>평가요약</button><button className={outputTab === "cashflow" ? "active" : ""} onClick={() => setOutputTab("cashflow")}>현금흐름</button><button className={outputTab === "evidence" ? "active" : ""} onClick={() => setOutputTab("evidence")}>업종근거</button></div>

          <section className={`tab-panel ${outputTab === "summary" ? "visible" : ""}`}>
            <div className="chart-card"><div className="chart-title"><div><strong>매출 전망</strong><span>단위: 백만원</span></div><strong>{fmtNum(analysis.rows.at(-1)?.sales ?? 0, 0)}</strong></div><svg role="img" aria-label="연도별 매출 전망 추세" viewBox="0 0 600 180" preserveAspectRatio="none"><line x1="30" y1="160" x2="570" y2="160" className="axis" /><line x1="30" y1="40" x2="30" y2="160" className="axis" /><polyline points={chartPoints} className="trend-shadow" /><polyline points={chartPoints} className="trend" />{analysis.rows.map((row, i) => { const [x, y] = chartPoints.split(" ")[i].split(","); return <circle key={row.year} cx={x} cy={y} r="3.5" />; })}</svg><div className="chart-years"><span>1년차</span><span>{analysis.life}년차</span></div></div>
            <div className="summary-grid"><article><span>적용 재무구조</span><dl><div><dt>매출원가율</dt><dd>{fmtPct(analysis.costRatio)}</dd></div><div><dt>판관비율</dt><dd>{fmtPct(analysis.sgaRatio)}</dd></div><div><dt>감가상각비율</dt><dd>{fmtPct(analysis.depreciationRatio)}</dd></div><div><dt>운전자본소요율</dt><dd>{fmtPct(analysis.workingCapitalRatio)}</dd></div></dl></article><article><span>로열티 기준</span><dl><div><dt>Q1</dt><dd>{fmtPct(industry.runningRoyaltyQ1, 2)}</dd></div><div><dt>Q2 중위수</dt><dd>{fmtPct(industry.runningRoyaltyQ2, 2)}</dd></div><div><dt>Q3</dt><dd>{fmtPct(industry.runningRoyaltyQ3, 2)}</dd></div><div><dt>상관행로열티</dt><dd>{fmtPct(industry.customaryRoyalty, 2)}</dd></div></dl></article></div>
            <div className="calculation-strip"><span>핵심 산식</span><p>{model.method === "income" ? "Σ [ 잉여현금흐름 × 기술기여도 × 할인계수 ]" : model.method === "royalty1" ? "Σ [ 매출액 × 경상로열티율 × 조정계수 × 기술비중 × (1−세율) × 할인계수 ]" : "Σ [ 매출액 × 선택 사분위 로열티율 × IP 유효성 × 기술비중 × (1−세율) × 할인계수 ]"}</p></div>
          </section>

          <section className={`tab-panel ${outputTab === "cashflow" ? "visible" : ""}`}>
            <div className="table-wrap"><table><thead><tr><th>연도</th><th>매출액</th><th>영업이익</th><th>FCF</th><th>기술현금흐름</th><th>할인계수</th><th>현재가치</th></tr></thead><tbody>{analysis.rows.map((row) => <tr key={row.year}><td>{row.year}</td><td>{fmtNum(row.sales, 0)}</td><td>{fmtNum(row.ebit, 0)}</td><td>{fmtNum(row.fcf, 0)}</td><td>{fmtNum(row.technologyCash, 0)}</td><td>{row.discountFactor.toFixed(4)}</td><td>{fmtNum(row.presentValue, 0)}</td></tr>)}</tbody><tfoot><tr><th colSpan={6}>기술가치 합계</th><th>{fmtNum(analysis.technologyValue, 0)}</th></tr></tfoot></table></div><p className="table-note">단위: 백만원. 음수 현금흐름도 할인하여 합산합니다.</p>
          </section>

          <section className={`tab-panel ${outputTab === "evidence" ? "visible" : ""}`}>
            <div className="evidence-card"><div><span className={`grade grade-${industry.dataGrade}`}>{industry.dataGrade}</span><div><strong>{industry.id} · {industry.name}</strong><p>{MODE_LABEL[industry.statMode]}</p></div></div><p>{industry.definition}</p><dl><div><dt>연계 원천분류</dt><dd>{industry.sourceCodes.join(", ")}</dd></div><div><dt>연계 분류명</dt><dd>{industry.sourceNames.join(" · ")}</dd></div><div><dt>재무통계 등가표본수</dt><dd>{fmtNum(industry.sample, 0)}</dd></div><div><dt>경상로열티 표본</dt><dd>{fmtNum(industry.runningRoyaltyCount, 0)}</dd></div><div><dt>상관행로열티 표본</dt><dd>{fmtNum(industry.customaryRoyaltyCount, 0)}</dd></div></dl></div>
            <div className="evidence-table"><h3>자본비용 및 자산구조</h3><dl><div><dt>베타</dt><dd>{industry.beta.toFixed(3)}</dd></div><div><dt>자기자본비용 Ke</dt><dd>{fmtPct(industry.ke, 2)}</dd></div><div><dt>타인자본비용 Kd</dt><dd>{fmtPct(industry.kd, 2)}</dd></div><div><dt>자기자본비율 E/V</dt><dd>{fmtPct(industry.equityRatio, 1)}</dd></div><div><dt>타인자본비율 D/V</dt><dd>{fmtPct(industry.debtRatio, 1)}</dd></div><div><dt>업종 WACC</dt><dd>{fmtPct(industry.wacc, 2)}</dd></div><div><dt>유형자산비중</dt><dd>{fmtPct(industry.tangibleAssetRatio, 1)}</dd></div><div><dt>무형자산비중</dt><dd>{fmtPct(industry.intangibleAssetRatio, 1)}</dd></div></dl></div>
            <p className="source-note">{SOURCE_NOTE}</p>
          </section>
          <footer className="report-footer"><span>V-RAY 2.0 · 공개 베타</span><p>본 결과는 기술가치평가 검토를 지원하는 참고자료이며, 공식 평가서 확정 전 평가전문가의 사업계획·권리성·시장성 검토가 필요합니다.</p></footer>
        </section>
      </div>

      <section className="methodology no-print"><div><span className="eyebrow">HOW IT WORKS</span><h2>입력은 간결하게,<br />근거는 끝까지 추적되게.</h2></div><ol><li><span>1</span><div><strong>업종 기준값</strong><p>73개 업종별 재무·로열티·자본비용·산업기술요소를 자동 불러옵니다.</p></div></li><li><span>2</span><div><strong>기술 조정</strong><p>수명 영향요인과 기술기여도 평가정보를 점수화해 평가대상 특성을 반영합니다.</p></div></li><li><span>3</span><div><strong>현금흐름 평가</strong><p>수익접근법 또는 두 가지 로열티공제법으로 연도별 현재가치를 계산합니다.</p></div></li></ol></section>
      <footer className="site-footer no-print"><div className="brand-lockup muted"><span className="brand-mark">V</span><div><strong>V-RAY 2.0</strong><small>Open technology valuation workspace</small></div></div><div><button onClick={() => importRef.current?.click()}>JSON 가져오기</button><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>맨 위로</button></div></footer>
    </main>
  );
}
