// فهرسة buildVendorIndex/buildProductIndex (matching.js) — تسريع buildRows/validateAll
// لمنشأة بمئات/آلاف الموردين والمنتجات بلا أي تغيير في نتيجة المطابقة نفسها. كل اختبار هنا
// يتحقق أن idx (المفهرَس) يُرجع بالضبط نفس نتيجة المسار القديم بلا idx.
import { describe, it, expect } from "vitest";
import {
  matchVendor, matchProduct, findProdBySku, buildVendorIndex, buildProductIndex,
} from "../matching.js";

function makeVendors(n) {
  const vendors = [];
  for (let i = 0; i < n; i++) vendors.push({ ref: `V${i}`, name: `مورد ${i}`, phone: `05${String(i).padStart(8, "0")}` });
  return vendors;
}
function makeProducts(n) {
  const products = [];
  for (let i = 0; i < n; i++) products.push({ sku: `SKU${i}`, name: `منتج ${i}`, purchasable: true, active: true });
  return products;
}

describe("buildVendorIndex/matchVendor — النتيجة مطابقة تماماً للمسار القديم بلا idx", () => {
  it("مطابقة بالرقم المرجعي (تام)", () => {
    const vendors = makeVendors(500);
    const idx = buildVendorIndex(vendors);
    const row = { vendorRefRaw: "V123", vendorNameRaw: "", vendorPhoneRaw: "" };
    const withIdx = matchVendor(row, vendors, idx);
    const noIdx = matchVendor(row, vendors);
    expect(withIdx).toEqual(noIdx);
    expect(withIdx.v.ref).toBe("V123");
  });

  it("مطابقة بالاسم التام", () => {
    const vendors = makeVendors(500);
    const idx = buildVendorIndex(vendors);
    const row = { vendorRefRaw: "", vendorNameRaw: "مورد 77", vendorPhoneRaw: "" };
    expect(matchVendor(row, vendors, idx)).toEqual(matchVendor(row, vendors));
  });

  it("مورّدون بأسماء مكررة → by:'dup' بنفس القائمة بالضبط", () => {
    const vendors = [{ ref: "A1", name: "شركة الاختبار" }, { ref: "A2", name: "شركة الاختبار" }];
    const idx = buildVendorIndex(vendors);
    const row = { vendorRefRaw: "", vendorNameRaw: "شركة الاختبار", vendorPhoneRaw: "" };
    const withIdx = matchVendor(row, vendors, idx);
    const noIdx = matchVendor(row, vendors);
    expect(withIdx.by).toBe("dup");
    expect(withIdx).toEqual(noIdx);
  });

  it("لا مطابقة تامة → يسقط لمطابقة substring (fallback بلا idx، نفس النتيجة)", () => {
    const vendors = makeVendors(200).concat([{ ref: "X1", name: "مؤسسة النور للتجارة" }]);
    const idx = buildVendorIndex(vendors);
    const row = { vendorRefRaw: "", vendorNameRaw: "النور", vendorPhoneRaw: "" };
    expect(matchVendor(row, vendors, idx)).toEqual(matchVendor(row, vendors));
  });

  it("رقم مرجعي غير موجود لأي مورد → by:'none' بالضبط كالمسار القديم", () => {
    const vendors = makeVendors(50);
    const idx = buildVendorIndex(vendors);
    const row = { vendorRefRaw: "NOPE", vendorNameRaw: "", vendorPhoneRaw: "" };
    expect(matchVendor(row, vendors, idx)).toEqual(matchVendor(row, vendors));
  });
});

describe("buildProductIndex/matchProduct/findProdBySku — تطابق تام مع المسار القديم", () => {
  it("مطابقة بالكود (SKU)", () => {
    const products = makeProducts(500);
    const idx = buildProductIndex(products);
    const row = { prodRefRaw: "SKU42", prodNameRaw: "" };
    expect(matchProduct(row, products, idx)).toEqual(matchProduct(row, products));
    expect(findProdBySku(products, "SKU42", idx)).toEqual(findProdBySku(products, "SKU42"));
  });

  it("منتج غير قابل للشراء يُستبعد من المرشحين عند تعدد الأسماء المطابقة — بنفس السلوك مع/بلا idx", () => {
    const products = [
      { sku: "P1", name: "قهوة", purchasable: false, active: true },
      { sku: "P2", name: "قهوة", purchasable: true, active: true },
    ];
    const idx = buildProductIndex(products);
    const row = { prodRefRaw: "", prodNameRaw: "قهوة" };
    const withIdx = matchProduct(row, products, idx);
    const noIdx = matchProduct(row, products);
    expect(withIdx).toEqual(noIdx);
    expect(withIdx.p.sku).toBe("P2"); // القابل للشراء فقط، رغم وجود مرشح آخر بنفس الاسم
  });

  it("كود غير موجود → findProdBySku يُرجع undefined سواء بidx أو بلاه", () => {
    const products = makeProducts(30);
    const idx = buildProductIndex(products);
    expect(findProdBySku(products, "GHOST", idx)).toBeUndefined();
    expect(findProdBySku(products, "GHOST")).toBeUndefined();
  });
});

describe("أداء: فهرسة مرة واحدة لملف كبير × منشأة كبيرة لا يتجاوز ثوانٍ معدودة", () => {
  it("5,000 صف × 3,000 مورّد و3,000 منتج (أقصى حد قيود لصفوف الاستيراد) دون تجميد", () => {
    const vendors = makeVendors(3000);
    const products = makeProducts(3000);
    const vendorIdx = buildVendorIndex(vendors);
    const productIdx = buildProductIndex(products);
    const start = Date.now();
    for (let i = 0; i < 5000; i++) {
      const row = { vendorRefRaw: `V${i % 3000}`, vendorNameRaw: "", vendorPhoneRaw: "", prodRefRaw: `SKU${i % 3000}`, prodNameRaw: "" };
      matchVendor(row, vendors, vendorIdx);
      matchProduct(row, products, productIdx);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000); // مع المسح الكامل القديم بلا فهرسة كانت هذه ملايين المقارنات
  });
});
