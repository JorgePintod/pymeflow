import { describe, it, expect } from "vitest";
import { SiiApiClient } from "../../src/modules/sii/sii.client.js";

describe("SiiApiClient", () => {
  const client = new SiiApiClient();

  describe("translateStatus", () => {
    it('debe traducir DOK a ACCEPTED', () => {
      expect(client.translateStatus("DOK")).toBe("ACCEPTED");
    });

    it('debe traducir SOK a ACCEPTED', () => {
      expect(client.translateStatus("SOK")).toBe("ACCEPTED");
    });

    it('debe traducir CRT a ACCEPTED', () => {
      expect(client.translateStatus("CRT")).toBe("ACCEPTED");
    });

    it('debe traducir RCT a REJECTED', () => {
      expect(client.translateStatus("RCT")).toBe("REJECTED");
    });

    it('debe traducir RFR a REJECTED', () => {
      expect(client.translateStatus("RFR")).toBe("REJECTED");
    });

    it('debe traducir RPR a OBJECTED', () => {
      expect(client.translateStatus("RPR")).toBe("OBJECTED");
    });

    it('debe traducir estado desconocido a PENDING', () => {
      expect(client.translateStatus("UNKNOWN")).toBe("PENDING");
      expect(client.translateStatus("")).toBe("PENDING");
    });
  });
});
