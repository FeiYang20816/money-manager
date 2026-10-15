(function (root) {
  "use strict";

  function evaluate(source) {
    const input = String(source).replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
    if (!input || input.length > 80) throw new Error("请输入金额（最多 80 个字符）");
    let position = 0;
    let total = { n: 0n, d: 1n };
    let term = null;
    let pending = "+";

    function operand() {
      const match = /^(\d{1,12})(?:\.(\d{1,2}))?/.exec(input.slice(position));
      if (!match) throw new Error("请输入完整算式，每个数字最多两位小数");
      position += match[0].length;
      const fraction = match[2] || "";
      return { n: BigInt(match[1] + fraction), d: 10n ** BigInt(fraction.length) };
    }
    function add(a, b) { return { n: a.n * b.d + b.n * a.d, d: a.d * b.d }; }
    function multiply(a, b) { return { n: a.n * b.n, d: a.d * b.d }; }
    function divide(a, b) {
      if (b.n === 0n) throw new Error("不能除以零");
      return { n: a.n * b.d, d: a.d * b.n };
    }
    while (position < input.length) {
      const value = operand();
      if (pending === "*" || pending === "/") term = pending === "*" ? multiply(term, value) : divide(term, value);
      else {
        if (term) total = add(total, term);
        term = pending === "-" ? { n: -value.n, d: value.d } : value;
      }
      if (position === input.length) break;
      pending = input[position++];
      if (!["+", "-", "*", "/"].includes(pending) || position === input.length) throw new Error("请输入完整算式");
    }
    total = add(total, term);
    if (total.n <= 0n) throw new Error("金额必须大于零");
    const cents = (total.n * 200n + total.d) / (total.d * 2n);
    if (cents <= 0n) throw new Error("计算结果不足 0.01 元");
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("金额过大");
    return Number(cents);
  }

  root.MoneyAmount = { evaluate: evaluate };
})(typeof window === "undefined" ? globalThis : window);
