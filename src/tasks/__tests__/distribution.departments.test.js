import { describe, expect, it, vi } from "vitest";
import {
  extractDepartmentFromOffDepKey,
  fetchDistributionDepartments,
  getDistributionOfficePrefixes,
} from "../distribution";

describe("подразделения из DcEmail для переключателя задач", () => {
  it("извлекает доступные подразделения из вариантов ключа одного РЦ", async () => {
    const get = vi.fn(async () => ({
      data: {
        d: {
          results: [
            { OffDepKey: "РЦ-8117Отдел обеспечения бизнеса" },
            { OffDepKey: "8117Группа отгрузки РЦ" },
            { OffDepKey: "РЦ8117Отдел обеспечения бизнеса" },
            { OffDepKey: "РЦ-8114Чужое подразделение" },
          ],
        },
      },
    }));

    const departments = await fetchDistributionDepartments("РЦ-8117", { get });

    expect(departments).toEqual(["Группа отгрузки РЦ", "Отдел обеспечения бизнеса"]);
    expect(get).toHaveBeenCalledTimes(1);
    const [url] = get.mock.calls[0];
    expect(url).toContain("/web/lists/getbytitle('DcEmail')/items");
    expect(url).toContain("$select=OffDepKey");
    expect(url).toContain("startswith(OffDepKey");
  });

  it("поддерживает офисный код и игнорирует ключи другого офиса", () => {
    expect(getDistributionOfficePrefixes("РЦ-8117")).toEqual([
      "РЦ-8117",
      "8117",
      "РЦ8117",
    ]);
    expect(extractDepartmentFromOffDepKey("8117Группа отгрузки РЦ", "РЦ-8117"))
      .toBe("Группа отгрузки РЦ");
    expect(extractDepartmentFromOffDepKey("РЦ-8114Группа отгрузки РЦ", "РЦ-8117"))
      .toBe("");
  });

  it("пустой офис не отправляет запрос", async () => {
    const get = vi.fn();
    expect(await fetchDistributionDepartments("", { get })).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
});
