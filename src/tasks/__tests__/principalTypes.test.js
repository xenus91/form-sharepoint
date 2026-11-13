import { describe, expect, it } from "vitest";
import {
  isDistributionListPrincipalType,
  isGroupPrincipalType,
  normalizePrincipalType,
} from "../principalTypes";

describe("тип Principal SharePoint", () => {
  it("нормализует числовой и текстовый тип почтовой рассылки", () => {
    expect(normalizePrincipalType("DistributionList")).toBe(2);
    expect(normalizePrincipalType(2)).toBe(2);
    expect(isDistributionListPrincipalType("DistributionList")).toBe(true);
    expect(isDistributionListPrincipalType(2)).toBe(true);
  });

  it("для AssignedTo не принимает пользователей и другие группы", () => {
    expect(isDistributionListPrincipalType(1)).toBe(false);
    expect(isDistributionListPrincipalType(4)).toBe(false);
    expect(isDistributionListPrincipalType(8)).toBe(false);
    expect(isDistributionListPrincipalType(15)).toBe(false);
    expect(isDistributionListPrincipalType("unknown")).toBe(false);
  });

  it("отличает группы от пользователей для общего поиска siteusers", () => {
    expect(isGroupPrincipalType(2)).toBe(true);
    expect(isGroupPrincipalType(4)).toBe(true);
    expect(isGroupPrincipalType(8)).toBe(true);
    expect(isGroupPrincipalType(1)).toBe(false);
    expect(isGroupPrincipalType(15)).toBe(false);
  });
});
