import { describe, expect, it } from "vitest";
import {
  basenameNoExt,
  buildUpFieldValue,
  checkStockLinkConsistency,
  findNoteByTypeAndBasename,
  findPrimaryThemePath,
  findStockNoteByTicker,
  findThemeNoteByName,
  parseThemeNames,
  stockNoteBaseName,
  wikilinkFromPath,
  type VaultNoteRef,
} from "../src/trades/noteLinks";

describe("wikilinkFromPath", () => {
  it("去除資料夾與副檔名", () => {
    expect(wikilinkFromPath("30-個股/台積電 2330.md")).toBe("[[台積電 2330]]");
  });

  it("無資料夾時也正確", () => {
    expect(wikilinkFromPath("AI 半導體.md")).toBe("[[AI 半導體]]");
  });
});

describe("findStockNoteByTicker", () => {
  const notes: VaultNoteRef[] = [
    { path: "30-個股/台積電 2330.md", frontmatter: { type: "stock", ticker: "2330" } },
    { path: "30-個股/信驊 5274.TWO.md", frontmatter: { type: "stock", ticker: "5274.TWO" } },
    { path: "40-交易紀錄/x.md", frontmatter: { type: "trade", ticker: "2330" } },
  ];

  it("找到相符 ticker 的個股筆記", () => {
    expect(findStockNoteByTicker(notes, "2330")).toBe("30-個股/台積電 2330.md");
  });

  it("忽略非 stock 類型的筆記（即使 ticker 相同）", () => {
    expect(findStockNoteByTicker([notes[2]], "2330")).toBeNull();
  });

  it("找不到時回傳 null", () => {
    expect(findStockNoteByTicker(notes, "9999")).toBeNull();
  });

  it("上櫃 .TWO 全管線比對正確", () => {
    expect(findStockNoteByTicker(notes, "5274.TWO")).toBe("30-個股/信驊 5274.TWO.md");
  });

  it("空字串 ticker 回傳 null", () => {
    expect(findStockNoteByTicker(notes, "")).toBeNull();
  });
});

describe("findThemeNoteByName / findNoteByTypeAndBasename", () => {
  const notes: VaultNoteRef[] = [
    { path: "20-題材/AI 半導體.md", frontmatter: { type: "theme" } },
    { path: "10-總經/總經 MOC.md", frontmatter: { type: "macro" } },
  ];

  it("依檔名（不含副檔名）找到題材筆記", () => {
    expect(findThemeNoteByName(notes, "AI 半導體")).toBe("20-題材/AI 半導體.md");
  });

  it("輸入含前後空白也能比對", () => {
    expect(findThemeNoteByName(notes, "  AI 半導體  ")).toBe("20-題材/AI 半導體.md");
  });

  it("找不到回傳 null", () => {
    expect(findThemeNoteByName(notes, "先進封裝")).toBeNull();
  });

  it("空字串回傳 null", () => {
    expect(findThemeNoteByName(notes, "")).toBeNull();
  });

  it("findNoteByTypeAndBasename 可指定任意 type（例如 macro）", () => {
    expect(findNoteByTypeAndBasename(notes, "macro", "總經 MOC")).toBe(
      "10-總經/總經 MOC.md"
    );
  });
});

describe("basenameNoExt", () => {
  it("去除資料夾與副檔名", () => {
    expect(basenameNoExt("30-個股/AI 半導體/台積電 2330.md")).toBe("台積電 2330");
  });

  it("多層子資料夾也正確", () => {
    expect(basenameNoExt("20-題材/先進封裝 CoWoS.md")).toBe("先進封裝 CoWoS");
  });

  it("無資料夾時也正確", () => {
    expect(basenameNoExt("2330.md")).toBe("2330");
  });
});

describe("findPrimaryThemePath", () => {
  const notes: VaultNoteRef[] = [
    { path: "20-題材/先進封裝 CoWoS.md", frontmatter: { type: "theme" } },
    { path: "20-題材/成熟製程.md", frontmatter: { type: "theme" } },
  ];

  it("取第一個能解析到現存題材筆記的名稱", () => {
    expect(findPrimaryThemePath(notes, ["不存在題材", "成熟製程", "先進封裝 CoWoS"])).toBe(
      "20-題材/成熟製程.md"
    );
  });

  it("第一個題材就存在時直接回傳", () => {
    expect(findPrimaryThemePath(notes, ["先進封裝 CoWoS", "成熟製程"])).toBe(
      "20-題材/先進封裝 CoWoS.md"
    );
  });

  it("全部找不到回傳 null", () => {
    expect(findPrimaryThemePath(notes, ["不存在A", "不存在B"])).toBeNull();
  });

  it("空陣列回傳 null", () => {
    expect(findPrimaryThemePath(notes, [])).toBeNull();
  });
});

describe("parseThemeNames", () => {
  it("以半形逗號分隔", () => {
    expect(parseThemeNames("AI 半導體, 先進封裝")).toEqual(["AI 半導體", "先進封裝"]);
  });

  it("以全形逗號、頓號分隔", () => {
    expect(parseThemeNames("AI 半導體，先進封裝、重電")).toEqual([
      "AI 半導體",
      "先進封裝",
      "重電",
    ]);
  });

  it("去除多餘空白與空項目", () => {
    expect(parseThemeNames(" AI 半導體 ,, 先進封裝 ")).toEqual(["AI 半導體", "先進封裝"]);
  });

  it("空字串回傳空陣列", () => {
    expect(parseThemeNames("")).toEqual([]);
  });
});

describe("buildUpFieldValue", () => {
  it("0 個題材 → 空字串", () => {
    expect(buildUpFieldValue([])).toBe(`""`);
  });

  it("1 個題材 → 單一字串（相容既有寫法）", () => {
    expect(buildUpFieldValue(["AI 半導體"])).toBe(`"[[AI 半導體]]"`);
  });

  it("多個題材 → YAML 行內陣列", () => {
    expect(buildUpFieldValue(["AI 半導體", "先進封裝"])).toBe(
      `["[[AI 半導體]]", "[[先進封裝]]"]`
    );
  });
});

describe("stockNoteBaseName", () => {
  it("有名稱時為「名稱 代號」", () => {
    expect(stockNoteBaseName("2330", "台積電")).toBe("台積電 2330");
  });

  it("名稱留空時只用代號，不產生「2330 2330」重複 token", () => {
    expect(stockNoteBaseName("2330", "")).toBe("2330");
  });

  it("名稱只有空白時視同留空", () => {
    expect(stockNoteBaseName("2330", "   ")).toBe("2330");
  });
});

describe("checkStockLinkConsistency", () => {
  it("ticker 一致時回傳 null", () => {
    expect(
      checkStockLinkConsistency("40/a.md", "2330", "2330", "30/台積電 2330.md")
    ).toBeNull();
  });

  it("ticker 一致但目標帶 .TW 後綴仍算一致（正規化後比對）", () => {
    expect(
      checkStockLinkConsistency("40/a.md", "2330", "2330.TW", "30/台積電 2330.md")
    ).toBeNull();
  });

  it("ticker 不一致時回傳含兩邊代號與檔名的 issue", () => {
    const issue = checkStockLinkConsistency(
      "40/a.md",
      "2330",
      "2303",
      "30/聯電 2303.md"
    );
    expect(issue).not.toBeNull();
    expect(issue?.filePath).toBe("40/a.md");
    expect(issue?.message).toContain("2330");
    expect(issue?.message).toContain("2303");
    expect(issue?.message).toContain("30/聯電 2303.md");
  });

  it("目標筆記沒有可用 ticker（空字串）時回傳 null", () => {
    expect(checkStockLinkConsistency("40/a.md", "2330", "", "30/x.md")).toBeNull();
  });
});
