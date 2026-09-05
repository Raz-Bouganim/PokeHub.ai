/**
 * What an agent class is allowed to do.
 *
 * Classes are permissions, not costumes (VISION / decided item #11): a class is
 * a hard allow-list of tools, enforced before the model sees the option, not a
 * description of what an agent tends to do.
 *
 * Each class is one `AgentClassPolicy` value in its own module (`scout.ts`,
 * `builder.ts`, …); `registry.ts` collects them and exposes the lookups the
 * rest of the app uses. `Bash` is one tool spanning many capabilities, so the
 * tool allow-list alone can't express "Runner may run tests but not write
 * source" — the classes that need it add a `bash` policy, evaluated by
 * `bash-guard.ts`.
 */

/** A verdict from a Bash policy check: allowed, or denied with a reason shown
 *  to the model and written to the event log. */
export type BashVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Per-class Bash gating. A command passes when EVERY `;`/`&&`/`||`/`|`-separated
 * segment matches no `deny` pattern and (when `allow` is non-empty) at least one
 * `allow` pattern.
 */
export interface BashPolicy {
  readonly allow: readonly RegExp[];
  readonly deny: readonly RegExp[];
  /** Shown to the model on denial and written to the event log. */
  readonly reason: string;
}

/** One agent class. `name` is the label used everywhere (roster files, the
 *  composer, event logs). */
export interface AgentClassPolicy {
  readonly name: string;
  /** The built-in tool names this class may use — a hard cap applied before the
   *  model sees the option. */
  readonly tools: readonly string[];
  /** Extra Bash gating, for classes where `Bash` is on the tool list but must
   *  not be a blank cheque (Runner, Keeper). */
  readonly bash?: BashPolicy;
}
