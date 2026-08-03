// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CurrencyPicker,
  currencyLabel,
  currencyName,
  currencyOptions,
  matchCurrencies,
} from "./currency-picker";
import { CURRENCY_CODES } from "@zframes/spec/spec";

// The picker exists because `CURRENCY_CODES` is 146 long: a native <select> over
// it can only be used by someone who already knows the ISO code. So the contract
// under test is that a user's actual vocabulary — "baht", "฿", "THB", "thai" —
// all reach the same row, and that the whole thing is drivable from the keyboard.

afterEach(() => cleanup());

describe("currency search", () => {
  it("covers every spec code exactly once", () => {
    const options = currencyOptions();
    expect(options.map((o) => o.code).sort()).toEqual(
      [...CURRENCY_CODES].sort(),
    );
    // An empty query lists them all — nothing is unreachable by scrolling.
    expect(matchCurrencies("").length).toBe(CURRENCY_CODES.length);
  });

  it("opens on the majors rather than alphabetically on AED", () => {
    // Alphabetical is a defensible sort and a useless first screen.
    expect(
      matchCurrencies("")
        .slice(0, 3)
        .map((o) => o.code),
    ).toEqual(["USD", "EUR", "GBP"]);
  });

  it("matches by code", () => {
    expect(matchCurrencies("thb")[0].code).toBe("THB");
    // Exact code beats a mere substring: "usd" must not land on AUD.
    expect(matchCurrencies("usd")[0].code).toBe("USD");
  });

  it("matches by the currency's name, which is what people type", () => {
    expect(matchCurrencies("baht")[0].code).toBe("THB");
    expect(matchCurrencies("thai")[0].code).toBe("THB");
    expect(matchCurrencies("yen")[0].code).toBe("JPY");
    expect(matchCurrencies("euro")[0].code).toBe("EUR");
    // "dollar" is many currencies; the point is that they're all findable.
    const dollars = matchCurrencies("dollar").map((o) => o.code);
    expect(dollars).toContain("USD");
    expect(dollars).toContain("AUD");
    expect(dollars.length).toBeGreaterThan(5);
  });

  it("matches by symbol", () => {
    expect(matchCurrencies("฿")[0].code).toBe("THB");
    expect(matchCurrencies("₹")[0].code).toBe("INR");
  });

  it("requires every token of a multi-word query", () => {
    expect(matchCurrencies("swiss franc").map((o) => o.code)).toEqual(["CHF"]);
    expect(matchCurrencies("thai dollar")).toEqual([]);
  });

  it("degrades on a code Intl has no name for", () => {
    // `fallback: "none"` means no name rather than the code echoed back, so a
    // nameless row reads "XPF", not "XPF · XPF".
    const name = currencyName("ZZZ");
    expect(name).toBe("");
    expect(currencyLabel("USD")).toContain("US Dollar");
    for (const option of currencyOptions()) {
      expect(option.name).not.toBe(option.code);
      expect(option.symbol.length).toBeGreaterThan(0);
    }
  });
});

/** Open the picker and return its filter input. */
function openPicker(): HTMLInputElement {
  fireEvent.click(screen.getByRole("button", { name: "Currency" }));
  return screen.getByRole("combobox") as HTMLInputElement;
}

describe("CurrencyPicker", () => {
  it("reads as the current choice and picks a searched code", () => {
    const onChange = vi.fn();
    render(<CurrencyPicker value="USD" label="Currency" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Currency" });
    expect(trigger.textContent).toContain("USD");
    expect(trigger.textContent).toContain("US Dollar");

    const input = openPicker();
    fireEvent.change(input, { target: { value: "baht" } });
    fireEvent.click(screen.getByRole("option", { name: /THB/ }));

    expect(onChange).toHaveBeenCalledWith("THB");
    // Closed again, focus handed back to the trigger — the same
    // returns-to-opener contract the config dialog implements.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("is drivable from the keyboard: type, arrow, Enter", () => {
    const onChange = vi.fn();
    render(<CurrencyPicker value="USD" label="Currency" onChange={onChange} />);
    const input = openPicker();
    // Focus moves into the filter on open, so typing just works.
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "dollar" } });
    const codes = matchCurrencies("dollar").map((o) => o.code);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(codes[2]);
  });

  it("wraps the highlight and reports it as aria-activedescendant", () => {
    render(<CurrencyPicker value="USD" label="Currency" onChange={vi.fn()} />);
    const input = openPicker();
    const activeCode = () =>
      document.getElementById(input.getAttribute("aria-activedescendant")!)
        ?.textContent;

    expect(activeCode()).toContain("USD");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    // Wraps to the last row rather than dead-ending at the top.
    expect(activeCode()).toContain(matchCurrencies("").at(-1)!.code);
    fireEvent.keyDown(input, { key: "Home" });
    expect(activeCode()).toContain("USD");
  });

  it("closes on Escape without picking anything", () => {
    const onChange = vi.fn();
    render(<CurrencyPicker value="USD" label="Currency" onChange={onChange} />);
    const input = openPicker();
    fireEvent.change(input, { target: { value: "baht" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    // Reopening starts from a clean filter, not the abandoned query.
    expect(openPicker().value).toBe("");
  });

  it("says so when nothing matches", () => {
    render(<CurrencyPicker value="USD" label="Currency" onChange={vi.fn()} />);
    const input = openPicker();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getByText("No currency matches")).toBeTruthy();
    // Enter on an empty list is inert rather than picking a stale row.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeTruthy();
  });

  it("offers inherit as a real, arrowable row and reports it as null", () => {
    const onChange = vi.fn();
    render(
      <CurrencyPicker
        value={null}
        inheritOf="THB"
        label="Currency"
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Currency" });
    // The default names what it resolves to — "inherit" alone says nothing.
    expect(trigger.textContent).toContain("Inherit board (THB)");

    const input = openPicker();
    const inherit = screen.getByRole("option", { name: /Inherit board/ });
    expect(inherit.getAttribute("aria-selected")).toBe("true");

    // Pin a code, then come back to inherit — via the keyboard, since a default
    // you can only click is not a default.
    fireEvent.click(screen.getByRole("option", { name: /^USD/ }));
    expect(onChange).toHaveBeenLastCalledWith("USD");
    const reopened = openPicker();
    fireEvent.keyDown(reopened, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).not.toBe(reopened);
  });

  it("hides the inherit row while filtering, since it has no code to match", () => {
    render(
      <CurrencyPicker
        value={null}
        inheritOf="USD"
        label="Currency"
        onChange={vi.fn()}
      />,
    );
    const input = openPicker();
    fireEvent.change(input, { target: { value: "eur" } });
    expect(screen.queryByRole("option", { name: /Inherit board/ })).toBeNull();
  });
});
