import { describe, expect, it, beforeEach } from "vitest";
import {
  ProviderDrainManager,
  DEFAULT_DRAIN_CONFIG,
  type ProviderDrainConfig
} from "../src/provider-drain.js";

describe("ProviderDrainManager", () => {
  let manager: ProviderDrainManager;

  beforeEach(() => {
    manager = new ProviderDrainManager();
  });

  describe("incident tracking", () => {
    it("increments incident count when reporting incidents", () => {
      manager.reportIncident("openai", 1000);
      manager.reportIncident("openai", 2000);

      const record = manager.getRecord("openai");
      expect(record?.incidentCount).toBe(2);
      expect(record?.lastIncidentAt).toBe(2000);
    });

    it("maintains separate incident counts per provider", () => {
      manager.reportIncident("openai", 1000);
      manager.reportIncident("anthropic", 1000);
      manager.reportIncident("openai", 2000);

      expect(manager.getRecord("openai")?.incidentCount).toBe(2);
      expect(manager.getRecord("anthropic")?.incidentCount).toBe(1);
    });
  });

  describe("drain trigger", () => {
    it("drains provider when incident threshold is crossed", () => {
      const config: Partial<ProviderDrainConfig> = { incidentThreshold: 3 };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      manager.reportIncident("openai", 2000);
      expect(manager.getStatus("openai")).toBe("healthy");

      manager.reportIncident("openai", 3000);
      expect(manager.getStatus("openai")).toBe("drained");
    });

    it("does not drain below minimum healthy provider floor", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 2,
        minHealthyProviders: 2
      };
      manager = new ProviderDrainManager(config);

      // Only one provider registered - should not be drained
      manager.reportIncident("openai", 1000);
      manager.reportIncident("openai", 2000);

      expect(manager.getStatus("openai")).toBe("healthy");
    });

    it("allows draining when enough healthy providers remain", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 2,
        minHealthyProviders: 1
      };
      manager = new ProviderDrainManager(config);

      // Register two providers
      manager.reportIncident("openai", 1000);
      manager.reportIncident("anthropic", 1000);

      // Drain one provider
      manager.reportIncident("openai", 2000);
      manager.reportIncident("openai", 3000);

      expect(manager.getStatus("openai")).toBe("drained");
      expect(manager.getStatus("anthropic")).toBe("healthy");
    });
  });

  describe("availability check", () => {
    it("returns available for healthy providers", () => {
      expect(manager.isAvailable("openai")).toBe(true);
      manager.reportIncident("openai", 1000);
      expect(manager.isAvailable("openai")).toBe(true);
    });

    it("returns not available for drained providers", () => {
      const config: Partial<ProviderDrainConfig> = { incidentThreshold: 1 };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      expect(manager.isAvailable("openai")).toBe(false);
    });

    it("returns available for recovering providers", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 1,
        cooldownMs: 1000
      };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      expect(manager.isAvailable("openai")).toBe(false);

      // Check recovery after cooldown
      manager.checkRecovery("openai", 2500);
      expect(manager.getStatus("openai")).toBe("recovering");
      expect(manager.isAvailable("openai")).toBe(true);
    });
  });

  describe("recovery cooldown", () => {
    it("does not allow recovery before cooldown expires", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 1,
        cooldownMs: 5000
      };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      expect(manager.getStatus("openai")).toBe("drained");

      // Try recovery before cooldown
      const recovered = manager.checkRecovery("openai", 3000);
      expect(recovered).toBe(false);
      expect(manager.getStatus("openai")).toBe("drained");
    });

    it("allows recovery after cooldown expires", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 1,
        cooldownMs: 1000
      };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      expect(manager.getStatus("openai")).toBe("drained");

      // Recovery after cooldown
      const recovered = manager.checkRecovery("openai", 2500);
      expect(recovered).toBe(true);
      expect(manager.getStatus("openai")).toBe("recovering");
    });

    it("resets incident count when entering recovery", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 3,
        cooldownMs: 1000
      };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      manager.reportIncident("openai", 2000);
      manager.reportIncident("openai", 3000);
      expect(manager.getRecord("openai")?.incidentCount).toBe(3);

      manager.checkRecovery("openai", 4500);
      expect(manager.getRecord("openai")?.incidentCount).toBe(0);
    });
  });

  describe("recovery confirmation", () => {
    it("confirms recovery and marks provider healthy", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 1,
        cooldownMs: 1000
      };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      manager.checkRecovery("openai", 2500);
      expect(manager.getStatus("openai")).toBe("recovering");

      manager.confirmRecovery("openai");
      expect(manager.getStatus("openai")).toBe("healthy");
    });

    it("fails recovery and re-drains provider", () => {
      const config: Partial<ProviderDrainConfig> = {
        incidentThreshold: 1,
        cooldownMs: 1000
      };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      manager.checkRecovery("openai", 2500);
      expect(manager.getStatus("openai")).toBe("recovering");

      manager.failRecovery("openai", 3000);
      expect(manager.getStatus("openai")).toBe("drained");
    });
  });

  describe("provider queries", () => {
    it("returns drained providers list", () => {
      const config: Partial<ProviderDrainConfig> = { incidentThreshold: 1 };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      manager.reportIncident("anthropic", 1000);

      expect(manager.getDrainedProviders()).toContain("openai");
      expect(manager.getDrainedProviders()).toContain("anthropic");
      expect(manager.getDrainedProviders()).toHaveLength(2);
    });

    it("returns available providers", () => {
      const config: Partial<ProviderDrainConfig> = { incidentThreshold: 2 };
      manager = new ProviderDrainManager(config);

      manager.reportIncident("openai", 1000);
      manager.reportIncident("openai", 2000); // drained
      manager.reportIncident("anthropic", 1000); // still healthy

      const available = manager.getAvailableProviders();
      expect(available).toContain("anthropic");
      expect(available).not.toContain("openai");
    });

    it("returns null for unknown provider records", () => {
      expect(manager.getRecord("unknown")).toBeNull();
      expect(manager.getStatus("unknown")).toBe("healthy");
    });
  });

  describe("default config", () => {
    it("uses default configuration values", () => {
      manager = new ProviderDrainManager();

      expect(DEFAULT_DRAIN_CONFIG.incidentThreshold).toBe(3);
      expect(DEFAULT_DRAIN_CONFIG.cooldownMs).toBe(60000);
      expect(DEFAULT_DRAIN_CONFIG.minHealthyProviders).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears all health records", () => {
      manager.reportIncident("openai", 1000);
      manager.reportIncident("anthropic", 1000);

      expect(manager.getRecord("openai")).not.toBeNull();
      expect(manager.getRecord("anthropic")).not.toBeNull();

      manager.reset();

      expect(manager.getRecord("openai")).toBeNull();
      expect(manager.getRecord("anthropic")).toBeNull();
    });
  });
});
