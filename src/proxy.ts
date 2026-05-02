import * as vscode from "vscode";
import { ProxyAgent, EnvHttpProxyAgent, Dispatcher } from "undici";

let globalDispatcher: Dispatcher | undefined;

export function getDispatcher(): Dispatcher {
  if (globalDispatcher) {
    return globalDispatcher;
  }

  const httpConfig = vscode.workspace.getConfiguration("http");
  const proxySupport = httpConfig.get<string>("proxySupport") || "on";

  if (proxySupport === "off") {
    return new EnvHttpProxyAgent(); // Still respect env vars if not explicitly off?
    // Actually, if off, we should probably use a direct dispatcher.
  }

  const proxy = httpConfig.get<string>("proxy");
  if (proxy) {
    try {
      globalDispatcher = new ProxyAgent(proxy);
      return globalDispatcher;
    } catch (e) {
      console.error("Markdown Link Assistant: Failed to create proxy agent", e);
    }
  }

  globalDispatcher = new EnvHttpProxyAgent();
  return globalDispatcher;
}
