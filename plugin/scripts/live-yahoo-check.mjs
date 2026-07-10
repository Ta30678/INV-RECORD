/**
 * 選跑：實測 Yahoo chart endpoint 是否可用、解析是否正確。
 * 失敗不擋 build（Yahoo 為非官方 API，可能暫時性失效）。
 *
 * 在有 HTTPS_PROXY 的環境（例如 Claude Code 遠端容器）中，
 * node fetch 不會自動吃 proxy，需用 undici ProxyAgent，
 * 並以 NODE_EXTRA_CA_CERTS 指向 proxy 的 CA bundle。
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

const symbol = process.argv[2] ?? "2330.TW";
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;

try {
  const res = await undiciFetch(url, {
    dispatcher,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    console.error(`Yahoo 回應 HTTP ${res.status}`);
    process.exit(1);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    console.error("回應中沒有 chart.result：", JSON.stringify(json).slice(0, 300));
    process.exit(1);
  }
  const bars = result.timestamp?.length ?? 0;
  const price = result.meta?.regularMarketPrice;
  console.log(`✓ ${symbol}：${bars} 根 K 棒，現價 ${price}`);
} catch (e) {
  console.error("連線失敗：", e.message ?? e);
  process.exit(1);
}
