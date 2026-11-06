"use client";
import { useState } from "react";

// Drag (or use the arrow keys on) the slider to compare a job's before and after photos.
export default function BeforeAfter({ jobs }) {
  const [i, setI] = useState(0);
  const [pos, setPos] = useState(50);
  const job = jobs[i] || jobs[0];
  return (
    <div className="ba-in">
      <div className="ba-text">
        <p className="eyebrow">Before &amp; after</p>
        <h2>{job.title}</h2>
        {job.text && <p className="lede">{job.text}</p>}
        {jobs.length > 1 && (
          <div className="ba-pick" role="group" aria-label="Choose a job">
            {jobs.map((j, k) => (
              <button key={k} type="button" aria-pressed={k === i} className={k === i ? "on" : ""} onClick={() => { setI(k); setPos(50); }}>{j.label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="ba-view">
        <div className="ba-frame">
          <img className="ba-after" src={job.after} alt={`After: ${job.title}`} />
          <div className="ba-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <img src={job.before} alt={`Before: ${job.title}`} />
          </div>
          <div className="ba-line" style={{ left: `${pos}%` }} aria-hidden="true"><span /></div>
          <span className="ba-tag l">Before</span><span className="ba-tag r">After</span>
        </div>
        <label className="ba-slider">
          <span>Drag to compare</span>
          <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare before and after" />
        </label>
      </div>
    </div>
  );
}
