export const DEFAULT_ALIASES: Record<string, string> = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  solana: 'SOL',
  sol: 'SOL',
  ripple: 'XRP',
  xrp: 'XRP',
  binance: 'BNB',
  bnb: 'BNB',
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class SymbolMapper {
  private readonly aliases: Record<string, string>;
  private readonly whitelist: Set<string>;

  constructor(whitelist: string[], aliases?: Record<string, string>) {
    this.whitelist = new Set(whitelist);
    this.aliases = { ...DEFAULT_ALIASES, ...aliases };
  }

  extractSymbols(text: string): string[] {
    const matches: { index: number; symbol: string }[] = [];

    for (const [alias, ticker] of Object.entries(this.aliases)) {
      const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const symbol = `${ticker}USDT`;
        if (this.whitelist.has(symbol)) {
          matches.push({ index: match.index, symbol });
        }
      }
    }

    matches.sort((a, b) => a.index - b.index);

    const seen = new Set<string>();
    const result: string[] = [];

    for (const { symbol } of matches) {
      if (seen.has(symbol)) {
        continue;
      }

      seen.add(symbol);
      result.push(symbol);
    }

    return result;
  }
}
