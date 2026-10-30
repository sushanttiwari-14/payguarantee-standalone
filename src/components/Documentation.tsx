import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, CircleAlert, Copy, ExternalLink, FileJson2, Play, ShieldCheck, Terminal } from "lucide-react";
import "./documentation.css";

type GuideDestination = "lab" | "scenarios" | "runs" | "connections";

function Command({ title, command }: { title: string; command: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      window.clearTimeout(timer.current);
      setCopyFailed(false);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); setCopyFailed(true); }
  }
  return <div className="dg-command">
    <div className="dg-command-top"><span><Terminal size={15} />{title}</span><button onClick={() => void copy()} aria-label={`Copy ${title.toLowerCase()} commands`}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>
    <pre tabIndex={0}><code>{command}</code></pre>
    <span className="dg-visually-hidden" aria-live="polite">{copied ? `${title} copied to clipboard.` : ""}</span>
    {copyFailed && <p className="dg-copy-error" role="status">Clipboard access is unavailable. Select and copy the text above.</p>}
  </div>;
}

export default function Documentation({ onNavigate }: { onNavigate: (page: GuideDestination) => void }) {
  return <div className="docs-page">
    <div className="page-heading"><div><div className="eyebrow">PAYPROOF GUIDE</div><h1>Quickstart</h1><p>Set up locally, run a controlled test, and understand what the evidence proves.</p></div><a className="button secondary" href="/api/docs" target="_blank" rel="noreferrer"><BookOpen size={16} />Full README <ExternalLink size={14} /></a></div>
    <div className="dg-layout">
      <aside className="dg-sidebar"><div className="dg-on-page">IN THIS GUIDE</div><nav aria-label="Quickstart sections"><a href="#guide-setup"><span>01</span>Quickstart</a><a href="#guide-run"><span>02</span>Run a check</a><a href="#guide-codex"><span>03</span>Connect Codex</a><a href="#guide-paypal"><span>04</span>PayPal Sandbox</a><a href="#guide-evidence"><span>05</span>Evidence & replay</a></nav><p>Start with the simulator. Add external tools when your test needs them.</p></aside>
      <div className="dg-content">
        <section id="guide-setup" className="panel dg-section" aria-labelledby="setup-heading">
          <div className="dg-section-heading"><span className="dg-section-number">01</span><div><h2 id="setup-heading">Start locally</h2><p>The simulator works without credentials.</p></div></div>
          <div className="dg-requirements"><span>Node.js 22+</span><span>npm</span><span>macOS or Linux</span></div>
          <p>From the PayProof project directory, install dependencies and start the development server.</p>
          <Command title="Project terminal" command={"npm install\nnpm run dev"} />
          <p>The default address is <code>http://127.0.0.1:4318</code>. The landing page introduces the product; <code>/app</code> opens the test lab. Windows has not been verified.</p>
          <div className="dg-section-actions"><button className="button primary" onClick={() => onNavigate("lab")}><Play size={16} />Open the test lab</button><a className="button text" href="/api/source"><ArrowDownToLine size={16} />Download source</a></div>
          <div className="dg-note"><ShieldCheck size={18} /><p><strong>Keep the server local.</strong> PayProof runs on the loopback interface as a single-user developer tool. Do not expose your authenticated server or Codex account as a shared public service.</p></div>
          <details className="dg-details"><summary><span>Tests and a production build</span><ChevronDown size={17} /></summary><div><p>Stop the development server before starting the production build on the same port. These tests use controlled dependencies, not live credentials.</p><Command title="Build and serve locally" command={"npm test\nnpm run build\nnpm start"} /></div></details>
        </section>

        <section id="guide-run" className="panel dg-section" aria-labelledby="run-heading">
          <div className="dg-section-heading"><span className="dg-section-number">02</span><div><h2 id="run-heading">Run your first check</h2><p>Compare the teaching agents against the same approved cases.</p></div></div>
          <ol className="dg-steps"><li><strong>Choose the seeded agent and Simulator.</strong><p>Select approved scenarios in the test lab, then choose <strong>Run test suite</strong>.</p></li><li><strong>Read the decision and payment evidence.</strong><p>Inspect cumulative-refund and lost-response cases. An agent’s claim that a refund succeeded is not a payment receipt.</p></li><li><strong>Repeat with the corrected agent.</strong><p>Keep the policy, cases, and evidence source the same. Check legitimate refunds as well as rejected requests.</p></li><li><strong>Compare the recorded runs.</strong><p>Run history identifies fixed failures, lost passes and unresolved cases, with changed checks and direct evidence links. Different policies, case inputs, sources or evaluators suppress improvement counts.</p></li></ol>
          <div className="dg-example"><div className="dg-example-caption">BUILT-IN TEACHING EXAMPLE · $20 CUMULATIVE LIMIT</div><div className="dg-example-row"><span><strong>$15</strong> refunded + <strong>$10</strong> requested</span><span className="dg-example-result">Escalation expected</span></div><div className="dg-example-row"><span><strong>$15</strong> refunded + <strong>$5</strong> requested</span><span className="dg-example-result dg-example-allowed">Refund permitted</span></div><p>The seeded agent contains intentional policy and retry defects. This example is not a discovered PayPal vulnerability or a measured AI-model failure.</p></div>
          <p>The library allows 60 active cases. Archive discarded drafts or retired cases to free space. Saved run evidence is retained. Restoring a case returns it to review; it must be approved again.</p><div className="dg-note dg-note-amber"><CircleAlert size={18} /><p><strong>Unconfirmed evidence cannot pass.</strong> The default suite includes pending payments and missing readbacks. Corrected behavior cannot turn incomplete evidence into a verified pass.</p></div>
          <div className="dg-section-actions"><button className="button secondary" onClick={() => onNavigate("runs")}>Open run history <ArrowRight size={16} /></button><button className="button text" onClick={() => onNavigate("scenarios")}>Review scenarios <ArrowRight size={16} /></button></div>
        </section>

        <section id="guide-codex" className="panel dg-section" aria-labelledby="codex-heading">
          <div className="dg-section-heading"><span className="dg-section-number">03</span><div><h2 id="codex-heading">Connect Codex</h2><p>Optional AI decisions and scenario generation through your local account.</p></div></div>
          <Command title="Sign in to Codex" command="npm run codex:login" />
          <p>Choose <strong>Sign in with ChatGPT</strong>, complete sign-in, then refresh status in Connections. PayProof uses the official Codex SDK and local CLI authentication store. A supported ChatGPT plan supplies the Codex allowance; usage limits apply. This app does not require an OpenAI API key.</p>
          <ul className="dg-list"><li>Select <strong>Codex</strong> as the agent in the test lab, or generate scenario candidates in Scenarios.</li><li>To test your own agent, choose <strong>Your agent</strong>, download the agent request, and paste version 2 decisions returned by your named, versioned agent. Requests use opaque IDs and exclude expected answers, library labels and injected faults.</li><li>Generated cases stay <strong>unapproved</strong> until you review them. The deterministic policy calculates expected actions; the model does not grade its own result.</li><li>AI errors are shown as errors. There is no fabricated fallback decision.</li></ul>
          <div className="dg-note"><ShieldCheck size={18} /><p><strong>Use synthetic test messages.</strong> Supplied messages are sent to the AI provider. PayPal credentials are not forwarded to the Codex runner, which runs with tool features disabled and read-only access.</p></div>
          <div className="dg-section-actions"><button className="button secondary" onClick={() => onNavigate("connections")}>Open Connections <ArrowRight size={16} /></button><a className="dg-resource-link" href="https://developers.openai.com/codex/auth" target="_blank" rel="noreferrer">Codex authentication <ExternalLink size={14} /></a></div>
        </section>

        <section id="guide-paypal" className="panel dg-section" aria-labelledby="paypal-heading">
          <div className="dg-section-heading"><span className="dg-section-number">04</span><div><h2 id="paypal-heading">Prepare PayPal Sandbox</h2><p>Use provider records when a local simulation is not enough.</p></div></div>
          <p>In the PayPal developer dashboard, create or select a <strong>Sandbox app</strong> and business account. Use a separate sandbox personal buyer account for checkout approval.</p>
          <a className="button secondary dg-dashboard-link" href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noreferrer">Open PayPal developer dashboard <ExternalLink size={15} /></a>
          <ol className="dg-steps"><li><strong>Configure the local server.</strong><p>For a new setup, copy <code>.env.example</code> to <code>.env</code>. Set <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code> to your sandbox app values, then restart the server. Keep this file local and preserve any existing settings.</p></li><li><strong>Create a sandbox order.</strong><p>In Connections, choose an approved scenario with no fault, or the controlled lost-response case. Create its order, follow the approval link, and sign in as the sandbox buyer.</p></li><li><strong>Capture the approved order.</strong><p>Returning to PayProof does not capture payment. Choose <strong>Capture approved order</strong>. The server reads the capture and prepares any prior refund required by the scenario.</p></li><li><strong>Use the ready fixture in the test lab.</strong><p>Select <strong>PayPal Sandbox</strong>, run the scenario, and inspect the actual capture/refund IDs and independent readbacks. Create a fresh fixture for every further run.</p></li></ol>
          <div className="dg-note dg-note-amber"><CircleAlert size={18} /><p><strong>Credentials present is not verification.</strong> A successful account flow requires buyer approval and retained payment evidence. Before execution, PayProof rereads the capture and opening balance. A prior-refund fixture without a confirmed provider aggregate remains unconfirmed and no new refund is attempted. Known failed checks still fail the case. Simulator output and mocked adapter tests do not establish a completed PayPal Sandbox run.</p></div>
          <details className="dg-details"><summary><span>Pending operations and interrupted runs</span><ChevronDown size={17} /></summary><div><p>A pending opening refund does not create a ready fixture. If an operation times out or its state is ambiguous, preserve the same fixture and its persisted operation IDs. Inspect known provider records before continuing; do not create fresh keys just to clear a timeout.</p><p>After editing scenario facts, inspect <strong>Original fixture inputs</strong>. Label-only edits keep the fixture usable. For a separate order, explicitly <strong>Set aside fixture</strong>; this preserves its payment records without cancelling or retrying anything. Unknown provider outcomes may still need investigation. Restore only changes local availability.</p><p>Keep <code>.payproof/state.json</code> and <code>.payproof/sandbox-journal.ndjson</code> after an interruption. Never change a used fixture back to ready or relabel an unresolved result as successful.</p></div></details>
          <p className="dg-small-note">The adapter is fixed to PayPal Sandbox and moves test funds only. Pending and unavailable-readback fault injections remain in the simulator; the lost-response case can withhold a response after a real Sandbox operation.</p>
          <div className="dg-section-actions"><button className="button secondary" onClick={() => onNavigate("connections")}>Open sandbox workbench <ArrowRight size={16} /></button><a className="dg-resource-link" href="https://developer.paypal.com/api/rest/reference/idempotency/" target="_blank" rel="noreferrer">PayPal retry guidance <ExternalLink size={14} /></a></div>
        </section>

        <section id="guide-evidence" className="panel dg-section" aria-labelledby="evidence-heading">
          <div className="dg-section-heading"><span className="dg-section-number">05</span><div><h2 id="evidence-heading">Read, export, and replay evidence</h2><p>Keep proposed actions separate from independently observed payments.</p></div></div>
          <dl className="dg-definitions"><div><dt>Attempted amount</dt><dd>Amounts requested by payment calls, including retries. This is not money moved.</dd></div><div><dt>Observed refund</dt><dd>New unique refund records independently confirmed as completed.</dd></div><div><dt>Total refunded</dt><dd>Verified opening refunds plus new completed refunds.</dd></div><div><dt>Excess refunded</dt><dd>Amount beyond this scenario’s applicable boundary. It is not measured money saved or customer loss.</dd></div><div><dt>Inconclusive</dt><dd>Evidence is incomplete or unresolved. It cannot count as verified success.</dd></div></dl>
          <p>Each selected case shows <strong>Tested inputs</strong>: the exact saved customer request, payment facts, supervisor approval, fault condition and policy. Later library edits do not change this snapshot.</p><h3 className="dg-subheading"><FileJson2 size={19} />Export a saved run</h3><p>Open a run and choose <strong>Export JSON</strong>, or use its download button in Run history. The file contains the policy snapshot, scenario facts, decisions, checks, event timeline, known refund readbacks, and evidence-source label.</p>
          <h3 className="dg-subheading"><Terminal size={19} />Evaluate your agent offline</h3><p>Return one decision per exported request ID and copy the input digest into your bundle. Download the separate evaluation fixture under the test lab’s decision-format details; keep it out of your agent prompt. The CLI needs no provider credentials. Payment execution and retry behavior belong to the runner; the result does not certify your agent’s internal tools.</p><Command title="Evaluate an agent bundle" command={"npm run evaluate -- payproof-evaluation-fixture.json decisions.json --out evidence.json"} /><h3 className="dg-subheading"><Terminal size={19} />Replay through the simulator</h3><p>Replace <code>path/to/export.json</code> with your downloaded evidence file. Add <code>corrected</code> to run the same saved inputs with the reference agent. A recorded input digest must match before replay. Older exports without a digest are explicitly marked unverified; this is input binding, not a signature proving file authenticity.</p>
          <Command title="Replay saved evidence" command={"npm run replay -- path/to/export.json\nnpm run replay -- path/to/export.json corrected"} />
          <h3 className="dg-subheading"><FileJson2 size={19} />Import and replay in the dashboard</h3><p>In Run history, choose <strong>Import evidence</strong> to open a complete CLI or dashboard export. Imported results receive a separate local ID and remain labeled <strong>Unverified external evidence</strong>. The file’s provider, AI and receipt claims are not independently confirmed by importing them.</p>
          <p>Open a saved run and choose <strong>Replay saved inputs</strong> to evaluate its saved policy, scenarios and recorded decisions. The result is saved as new local evidence with source lineage. Comparison choices and filters stay in the URL across evidence drilldown, Back and reload.</p>
          <p>Replay makes <strong>no PayPal or AI calls</strong>. It does not recreate historical provider state. Recorded decisions are reused by default; the model is not sampled again. New checks record their evaluator version. Historical results remain unchanged and can differ when re-evaluated by a newer checker.</p>
          <div className="dg-note"><ShieldCheck size={18} /><p><strong>Keep the evidence boundary visible.</strong> A run covers selected fixtures and known refund IDs, not every payment on a merchant account. Inspect exports before sharing: they contain test messages and model output. Passing cases are not production certification.</p></div>
          <div className="dg-section-actions"><button className="button secondary" onClick={() => onNavigate("runs")}>Open saved runs <ArrowRight size={16} /></button><a className="dg-resource-link" href="/api/docs" target="_blank" rel="noreferrer">Full README <ExternalLink size={14} /></a></div>
        </section>
        <footer className="dg-footer"><span>PayProof is a local developer prototype.</span><div><a href="/api/source"><ArrowDownToLine size={15} />Source bundle</a><a href="/api/license" target="_blank" rel="noreferrer">MIT license <ExternalLink size={13} /></a><a href="#guide-setup">Back to top ↑</a></div></footer>
      </div>
    </div>
  </div>;
}
