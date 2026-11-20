import { describe, expect, it } from "vitest";
import { DEFAULT_FAIL2BAN_JAILS } from "./fail2banPresets";

describe("default Fail2Ban jail presets", () => {
  it("starts every preset disabled and provides complete jail settings", () => {
    expect(DEFAULT_FAIL2BAN_JAILS.length).toBeGreaterThan(0);
    for (const jail of DEFAULT_FAIL2BAN_JAILS) {
      expect(jail.is_enabled).toBe(false);
      expect(jail.jail_name).toBeTruthy();
      expect(jail.filter_name).toBeTruthy();
      expect(jail.action).toBeTruthy();
      expect(jail.log_path).toBeTruthy();
      expect(jail.max_retries).toBeGreaterThan(0);
      expect(jail.ban_time).toBeGreaterThan(0);
      expect(jail.find_time).toBeGreaterThan(0);
    }
  });

  it("does not define duplicate jail names", () => {
    const names = DEFAULT_FAIL2BAN_JAILS.map((jail) => jail.jail_name);
    expect(new Set(names).size).toBe(names.length);
  });
});
