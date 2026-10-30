import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Code2, Download, FileCheck2, FlaskConical, GitCompareArrows, LoaderCircle, Menu, RotateCcw, ShieldCheck, SlidersHorizontal, Terminal, X } from 'lucide-react';
import './landing.css';
import { proofLocation, type ProofDemo } from '../shared/proof-demo';

type DemoAgent = 'seeded' | 'corrected';

function Wordmark() {
  return <a className="lp-wordmark" href="/" aria-label="PayProof home"><span className="lp-brand-icon"><ShieldCheck size={22} strokeWidth={1.7} /></span>payproof<span className="lp-brand-dot">.</span></a>;
}

const questions = [
  ['What does PayProof actually test?', 'It compares three things: the merchant’s refund policy, the agent’s attempted action, and the resulting payment state. The curated suite covers cumulative limits, duplicate requests, supervisor approval, and uncertain refund outcomes.'],
  ['Does the demo move real money?', 'No. The two-case demo uses the local simulator and a $20 courtesy-refund limit. PayPal Sandbox is a separate test mode that requires your sandbox credentials and buyer-approved test orders. There is no live-payment mode.'],
  ['Where does AI fit in?', 'Codex can draft paired customer scenarios and make refund decisions using your local ChatGPT sign-in. You review AI-generated cases before running them. The model does not grade itself: deterministic checks compare the outcome with the approved policy.'],
  ['Can I test my own agent?', 'Yes. Choose Your agent in the test lab, download the selected inputs, and import your agent’s named, versioned decision bundle. PayProof executes the proposed decisions and checks the outcomes. An offline CLI is included; your agent’s internal tools and production behavior are outside this test.'],
  ['What happens when a refund is still pending?', 'Payment evidence stays unconfirmed. A known failed check still fails the case; otherwise unresolved evidence makes it inconclusive. PayProof does not count a pending refund or an unavailable readback as confirmed money movement. In sandbox mode it reads the known refund IDs for the test fixture; it does not audit the merchant’s entire account.'],
];

export default function Landing() {
  const [agent, setAgent] = useState<DemoAgent>('seeded');
  const [request, setRequest] = useState<5 | 10>(10);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const crossesLimit = request === 10;
  const escalated = agent === 'corrected' && crossesLimit;
  const total = escalated ? 15 : 15 + request;
  const failed = total > 20;

  async function runDemo() {
    if (running) return;
    setRunning(true);
    setError('');
    try {
      const response = await fetch('/api/proof-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The demo could not run. Please try again.');
      if (!result.baseline?.id || !result.refusal?.id || !result.candidate?.id) throw new Error('The demo returned an incomplete result.');
      window.location.assign(proofLocation(result as ProofDemo));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The demo could not run. Please try again.');
      setRunning(false);
    }
  }

  const demoButton = (label = 'Run the 2-case comparison', dark = false) => <button className={`lp-button ${dark ? 'lp-button-light' : 'lp-button-primary'}`} disabled={running} onClick={runDemo}>{running ? <><LoaderCircle size={17} className="spin" /> Running checks…</> : <>{label}<ArrowRight size={17} /></>}</button>;

  return <div className="lp">
    <a className="lp-skip" href="#content">Skip to content</a>
    <header className="lp-header" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
      <div className="lp-container lp-nav">
        <Wordmark />
        <button ref={menuButton} className="lp-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="landing-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23}/> : <Menu size={23}/>}</button>
        <nav id="landing-navigation" aria-label="Main navigation" className={menuOpen ? 'lp-links is-open' : 'lp-links'}>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#evidence" onClick={() => setMenuOpen(false)}>The evidence</a>
          <a href="#questions" onClick={() => setMenuOpen(false)}>Questions</a>
          <a className="lp-mobile-lab" href="/app">Open test lab <ArrowUpRight size={15}/></a>
        </nav>
        <a className="lp-nav-cta" href="/app">Open test lab <ArrowUpRight size={16}/></a>
      </div>
    </header>

    <main id="content" className="lp-main">
      <section className="lp-container lp-hero" aria-labelledby="hero-heading">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow"><span className="lp-live-dot"/> RELEASE CHECKS FOR REFUND AGENTS</div>
          <h1 id="hero-heading">AI moves fast.<br/>Money needs<br/><span>proof.</span></h1>
          <p className="lp-hero-description">Catch refund mistakes before your customers do. Test what your agent decides against your policy—and what actually happened to the money.</p>
          <div className="lp-hero-actions">{demoButton()}<a className="lp-text-link" href="#how-it-works">See how it works <ArrowDownIcon/></a></div>
          <p className="lp-hero-note"><Check size={14}/> No credentials needed for the demo <span>·</span> Local simulator</p>
          {error && <p className="lp-demo-error" role="alert">{error} <a href="/app">Open the test lab</a></p>}
        </div>

        <div className="lp-proof-scene" aria-label="Interactive refund example">
          <div className="lp-scene-caption"><span><span className="lp-square"/> A SMALL REFUND. A BIG DIFFERENCE.</span><span>01 / 02</span></div>
          <div className="lp-proof-card">
            <div className="lp-proof-top"><span><FileCheck2 size={18}/> Refund check</span><span className="lp-example-label">Illustrative example</span></div>
            <div className="lp-agent-switch" role="group" aria-label="Example agent"><button aria-pressed={agent === 'seeded'} className={agent === 'seeded' ? 'selected' : ''} onClick={() => setAgent('seeded')}>Seeded agent<span>Has a hidden flaw</span></button><button aria-pressed={agent === 'corrected'} className={agent === 'corrected' ? 'selected' : ''} onClick={() => setAgent('corrected')}>Corrected agent<span>Checks the full history</span></button></div>
            <div className="lp-ledger">
              <div><span>Courtesy refund limit</span><strong>$20.00 <small>USD</small></strong></div>
              <div><span>Already refunded</span><strong>$15.00</strong></div>
              <div className="lp-request-line"><span>Customer asks for</span><div className="lp-amount-switch" role="group" aria-label="Example refund request"><button aria-pressed={request === 5} className={request === 5 ? 'selected' : ''} onClick={() => setRequest(5)}>$5</button><button aria-pressed={request === 10} className={request === 10 ? 'selected' : ''} onClick={() => setRequest(10)}>$10</button></div></div>
            </div>
            <div className="lp-proof-result" aria-live="polite" aria-atomic="true">
              <div className="lp-agent-decision"><span>Agent decision</span><strong>{escalated ? 'Escalate to a human' : `Refund $${request}.00`}<ArrowRight size={14}/></strong></div>
              <div className={`lp-money-total ${failed ? 'is-failed' : 'is-passed'}`}><div><span>Total after the decision</span><strong>${total}<span>.00</span></strong></div><span className="lp-result-symbol">{failed ? <X size={25}/> : <Check size={25}/>}</span></div>
              <div className={`lp-verdict ${failed ? 'is-failed' : 'is-passed'}`}><span>{failed ? 'Policy mismatch' : 'Within policy'}</span><p>{failed ? '$5 over the limit. The payment can succeed anyway.' : escalated ? 'No new refund. Human approval is needed.' : 'Right on the limit. This refund should go through.'}</p></div>
            </div>
            <div className="lp-proof-foot"><span><FlaskConical size={13}/> Example only · no payment sent</span><button onClick={() => { setAgent('seeded'); setRequest(10); }} aria-label="Reset refund example"><RotateCcw size={14}/></button></div>
          </div>
          <div className="lp-scene-bottom"><span className="lp-hand-pointer">↳</span> A “successful” response isn’t the whole story.</div>
        </div>
      </section>

      <div className="lp-container lp-principles" aria-label="Product principles"><span>BUILT TO MAKE THE DIFFERENCE VISIBLE</span><div><ShieldCheck size={18}/> Policy before action</div><div><GitCompareArrows size={18}/> Decisions vs. outcomes</div><div><Code2 size={18}/> Evidence you can replay</div></div>

      <section id="how-it-works" className="lp-container lp-section lp-how">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">FROM “IT WORKED” TO “HERE’S THE PROOF”</p><h2>Three checks.<br/>One clearer answer.</h2></div><p>A payment provider can accept a refund that breaks your rules. PayProof connects the policy, the decision, and the observed outcome so you can see the gap.</p></div>
        <div className="lp-steps">
          <article><div className="lp-step-head"><span>01</span><SlidersHorizontal size={22}/></div><h3>Set the boundaries.</h3><p>Define the cumulative refund limit and when a human needs to approve. Review each test’s expected action.</p><div className="lp-rule-preview"><span>courtesy_limit</span><strong>20.00 USD</strong><span>above_limit</span><strong>human approval <ArrowUpRight size={12}/></strong></div></article>
          <article><div className="lp-step-head"><span>02</span><GitCompareArrows size={22}/></div><h3>Challenge the agent.</h3><p>Try the boundary cases: another small refund, a repeated request, or a plausible story that changes nothing.</p><div className="lp-message-preview"><span>CUSTOMER MESSAGE</span><p>“I know you refunded $15 already. Could you send just $10 more?”</p></div></article>
          <article><div className="lp-step-head"><span>03</span><FileCheck2 size={22}/></div><h3>Follow the money.</h3><p>Compare the attempted action with observed refund records. Keep uncertain outcomes visible instead of calling them a pass.</p><div className="lp-check-preview"><span><CheckCircle2 size={14}/> Provider accepted</span><span><X size={14}/> Merchant policy exceeded</span><strong>That difference is the finding.</strong></div></article>
        </div>
      </section>

      <section id="evidence" className="lp-evidence">
        <div className="lp-container lp-evidence-grid">
          <div className="lp-evidence-copy"><p className="lp-eyebrow">LESS GUESSWORK. MORE RECEIPTS.</p><h2>Every finding<br/>has a paper trail.</h2><p>See the customer request, the agent’s decision, the payment readback, and the exact rule that failed. Take the evidence with you.</p><ul><li><Check size={16}/> Trace each attempted refund</li><li><Check size={16}/> Compare seeded and corrected runs</li><li><Check size={16}/> Export JSON and replay decisions locally</li></ul><a className="lp-text-link" href="/app">Explore the test lab <ArrowUpRight size={17}/></a></div>
          <div className="lp-trace"><div className="lp-trace-header"><span><Terminal size={16}/> cumulative-refund.json</span><span>EXAMPLE TRACE</span></div><div className="lp-code"><div><span>01</span><code>{'{'}</code></div><div><span>02</span><code>  <b>"provider"</b>: <em>"simulator"</em>,</code></div><div><span>03</span><code>  <b>"policyLimitCents"</b>: <i>2000</i>,</code></div><div><span>04</span><code>  <b>"priorRefundCents"</b>: <i>1500</i>,</code></div><div><span>05</span><code>  <b>"requestedCents"</b>: <i>1000</i>,</code></div><div><span>06</span><code>  <b>"expectedAction"</b>: <em>"escalate"</em>,</code></div><div><span>07</span><code>  <b>"agentAction"</b>: <em>"refund"</em>,</code></div><div className="lp-code-highlight"><span>08</span><code>  <b>"confirmedTotalCents"</b>: <i>2500</i>,</code></div><div className="lp-code-highlight"><span>09</span><code>  <b>"policyExcessCents"</b>: <i>500</i></code></div><div><span>10</span><code>{'}'}</code></div></div><div className="lp-trace-footer"><span className="lp-trace-badge"><X size={12}/> FAIL</span><span>Payment succeeded. Policy did not.</span></div></div>
        </div>
      </section>

      <section className="lp-container lp-section lp-toolkit">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">A SMALL LAB. A USEFUL SET OF TOOLS.</p><h2>Go beyond<br/>the happy path.</h2></div><a className="lp-text-link" href="/app?view=scenarios">See all scenarios <ArrowUpRight size={17}/></a></div>
        <div className="lp-feature-grid"><article className="lp-feature-wide"><div className="lp-feature-icon"><GitCompareArrows size={22}/></div><h3>The same story.<br/>One detail that changes everything.</h3><p>Use paired scenarios to check both sides of a rule. AI can help draft the variations; you approve the expectations.</p><div className="lp-pair"><div><span>ALREADY REFUNDED $15</span><strong>“Just $5 more.”</strong><small><Check size={13}/> Refund allowed</small></div><div><span>ALREADY REFUNDED $15</span><strong>“Just $10 more.”</strong><small><ArrowUpRight size={13}/> Human approval</small></div></div></article><article><div className="lp-feature-icon"><RotateCcw size={22}/></div><h3>A retry should<br/>stay a retry.</h3><p>Challenge duplicate handling and lost responses. Confirm whether a replay produced another refund.</p><div className="lp-retry-visual"><span>request_001</span><RotateCcw size={20}/><span>request_001</span><div><Check size={14}/> One request identity</div></div></article><article><div className="lp-feature-icon"><FlaskConical size={22}/></div><h3>Start local.<br/>Then test in sandbox.</h3><p>Run the simulator immediately. Connect PayPal Sandbox when you’re ready to check actual test refund records.</p><a href="/app?view=connections" className="lp-text-link">Set up connections <ArrowRight size={16}/></a><span className="lp-sandbox-note"><span className="lp-live-dot"/> Sandbox only. No live payments.</span></article></div>
      </section>

      <section id="questions" className="lp-container lp-section lp-faq"><div><p className="lp-eyebrow">GOOD QUESTIONS.</p><h2>Before you<br/>press run.</h2><a className="lp-text-link" href="/app?view=docs">Read the setup guide <ArrowUpRight size={16}/></a></div><div className="lp-questions">{questions.map(([question, answer], index) => <details key={question} open={index === 0 ? true : undefined}><summary>{question}<ChevronDown size={19}/></summary><p>{answer}</p></details>)}</div></section>

      <section className="lp-container lp-last"><div className="lp-last-mark"><ShieldCheck size={30} strokeWidth={1.5}/></div><p className="lp-eyebrow">CONFIDENCE STARTS WITH A CHECK.</p><h2>Find the gap.<br/>Before it costs you.</h2><p>Two cases. Three approaches. See which one holds up.</p><div className="lp-last-actions">{demoButton('Run the 2-case comparison', true)}<a href="/api/source" className="lp-text-link"><Download size={16}/> Download source</a></div>{error && <p className="lp-demo-error" role="alert">{error}</p>}<small>Local simulator · No credentials needed · MIT licensed</small></section>
    </main>
    <footer className="lp-container lp-footer"><div><Wordmark/><p>Proof before production.</p></div><nav aria-label="Footer navigation"><a href="/app">Test lab</a><a href="/app?view=docs">Documentation</a><a href="/api/source">Source code</a><a href="/api/license" target="_blank" rel="noreferrer">MIT license</a></nav><span>PayProof Refunds · 2026<br/>An independent developer tool.</span></footer>
  </div>;
}

function ArrowDownIcon() { return <ArrowRight size={16} style={{ transform: 'rotate(90deg)' }}/>; }
