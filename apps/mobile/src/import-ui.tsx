import React, { useState } from "react";
import { View, ScrollView, Switch, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Upload, Download } from "lucide-react-native";
import { api } from "./api";
import { alertError } from "./state";
import { C, T, Button, Sheet, Card, Notice } from "./ui";
import type { ImportPreview } from "./types";
const templates = {
  products:
    "sku,name,category,price,mrp,cost,stock,low_stock_threshold,unit,image_url,artwork\nRICE-1KG,Basmati Rice,Groceries,119,140,91,40,5,1 kg,,rice\n",
  invoices:
    "invoice_number,invoice_date,customer_phone,sku,quantity,unit_price,discount\nSALE-001,2026-10-03,,RICE-1KG,2,119,0\n",
};
export async function shareCsv(filename: string, csv: string) {
  const path = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(path, {
      mimeType: "text/csv",
      dialogTitle: filename,
    });
  else
    Alert.alert(
      "Saved export",
      "The CSV was saved to the app cache. Sharing is unavailable on this device.",
    );
}
export function ImportButton({
  type,
  onComplete,
}: {
  type: "products" | "invoices";
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [adjust, setAdjust] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          type === "products"
            ? [
                "text/csv",
                "text/comma-separated-values",
                "application/csv",
                "application/vnd.ms-excel",
              ]
            : [
                "text/csv",
                "text/comma-separated-values",
                "application/csv",
                "application/vnd.ms-excel",
                "application/pdf",
                "image/png",
                "image/jpeg",
              ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size || 0) > 5 * 1024 * 1024)
        throw new Error("Choose a file smaller than 5 MB.");
      setBusy(true);
      const form = new FormData();
      form.append("type", type);
      form.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || "text/csv",
      } as any);
      const r = await api.request<{ preview: ImportPreview }>(
        "/api/admin/imports/preview",
        { method: "POST", body: form },
      );
      setPreview(r.preview);
      setAdjust(false);
      setReviewed(false);
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/admin/imports/${preview.id}/commit`, {
        adjustInventory: adjust,
      });
      setPreview(null);
      onComplete();
      Alert.alert(
        "Import complete",
        `${r.importedRows || preview.validRows} rows imported successfully.`,
      );
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        title={type === "products" ? "Import CSV" : "Import invoices"}
        variant="secondary"
        onPress={pick}
        loading={busy}
        icon={<Upload size={16} color={C.forest} />}
      />
      <Sheet
        visible={!!preview}
        onClose={() => {
          if (!busy) setPreview(null);
        }}
        title="Review your import"
      >
        {preview && (
          <View style={{ gap: 17 }}>
            <Card>
              <T bold>{preview.filename}</T>
              <T size={12} color={C.muted} style={{ marginTop: 7 }}>
                {preview.rowCount} rows · {preview.errorCount} issues
                {type === "invoices"
                  ? ` · ${preview.invoiceCount || 0} invoices`
                  : ""}
              </T>
            </Card>
            <Notice text={preview.note} />
            {preview.requiresReview && (
              <Notice text="AI extracted these lines. Check the amounts, quantities, dates and SKUs against the original invoice. If anything differs, upload a corrected CSV." />
            )}
            {preview.errors.length > 0 && (
              <Card>
                <T bold color={C.red} style={{ marginBottom: 10 }}>
                  Fix these rows and upload again
                </T>
                {preview.errors.slice(0, 20).map((e, i) => (
                  <T
                    key={i}
                    size={11}
                    color={C.red}
                    style={{ marginBottom: 8, lineHeight: 18 }}
                  >
                    Row {e.row}: {e.message}
                  </T>
                ))}
              </Card>
            )}
            <Card>
              <T bold style={{ marginBottom: 13 }}>
                Data preview
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={{ minWidth: 650 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      backgroundColor: "#F0F3EA",
                      paddingVertical: 10,
                      borderRadius: 7,
                    }}
                  >
                    {(type === "products"
                      ? ["SKU", "Product", "Price (₹)", "Stock"]
                      : ["Invoice", "SKU", "Qty", "Unit price (₹)"]
                    ).map((h, i) => (
                      <View
                        key={h}
                        style={{
                          width: i === 0 ? 180 : i === 1 ? 250 : 100,
                          paddingHorizontal: 10,
                        }}
                      >
                        <T bold size={10} color={C.muted}>
                          {h}
                        </T>
                      </View>
                    ))}
                  </View>
                  {preview.rows.map((r, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        paddingVertical: 11,
                        borderBottomWidth: 1,
                        borderColor: C.line,
                      }}
                    >
                      {(type === "products"
                        ? [r.sku, r.name, r.price, r.stock]
                        : [r.invoice_number, r.sku, r.quantity, r.unit_price]
                      ).map((v, j) => (
                        <View
                          key={j}
                          style={{
                            width: j === 0 ? 180 : j === 1 ? 250 : 100,
                            paddingHorizontal: 10,
                          }}
                        >
                          <T size={11}>{String(v)}</T>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
              {preview.rowCount > preview.rows.length && (
                <T size={10} color={C.muted} style={{ marginTop: 12 }}>
                  Showing the first {preview.rows.length} of {preview.rowCount}{" "}
                  validated rows.
                </T>
              )}
            </Card>
            {type === "invoices" && (
              <Card>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 15,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <T bold size={13}>
                      Deduct stock for these sales?
                    </T>
                    <T
                      size={11}
                      color={C.muted}
                      style={{ lineHeight: 18, marginTop: 5 }}
                    >
                      Leave off for historical invoices whose stock was already
                      updated.
                    </T>
                  </View>
                  <Switch
                    value={adjust}
                    onValueChange={setAdjust}
                    trackColor={{ true: C.forest, false: C.line }}
                    thumbColor={C.white}
                  />
                </View>
              </Card>
            )}
            {preview.canCommit && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
              >
                <Switch
                  value={reviewed}
                  onValueChange={setReviewed}
                  trackColor={{ true: C.forest, false: C.line }}
                  thumbColor={C.white}
                />
                <T size={12} style={{ flex: 1 }}>
                  I reviewed this file and its import settings.
                </T>
              </View>
            )}
            <Button
              title="Confirm import"
              onPress={commit}
              loading={busy}
              disabled={!preview.canCommit || !reviewed}
            />
            <Button
              title="Get CSV template"
              variant="ghost"
              onPress={() =>
                void shareCsv(
                  `aone-${type}-template.csv`,
                  templates[type],
                ).catch(alertError)
              }
              icon={<Download size={15} color={C.forest} />}
            />
          </View>
        )}
      </Sheet>
    </>
  );
}
