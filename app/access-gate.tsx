"use client";

import { FormEvent, useState } from "react";

export default function AccessGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/access/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("비밀번호가 올바르지 않습니다.");
        setPassword("");
        return;
      }

      window.location.replace("/");
    } catch {
      setError("접속을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="access-shell">
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-brand" aria-hidden="true">V</div>
        <p className="access-eyebrow">V-RAY 2.0 · RESTRICTED</p>
        <h1 id="access-title">비밀번호가 필요한 평가도구입니다.</h1>
        <p className="access-description">
          승인받은 사용자만 농식품 기술가치평가 화면에 접근할 수 있습니다.
        </p>
        <form onSubmit={unlock} className="access-form">
          <label htmlFor="access-password">접근 비밀번호</label>
          <input
            id="access-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            required
          />
          {error ? <p className="access-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting || !password}>
            {submitting ? "확인 중…" : "V-RAY 접속"}
          </button>
        </form>
        <p className="access-note">인증 세션은 이 브라우저에서 최대 8시간 유지됩니다.</p>
      </section>
    </main>
  );
}
