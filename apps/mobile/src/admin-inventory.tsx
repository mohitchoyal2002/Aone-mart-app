import { ActionPressable as Pressable } from "./motion";
import { AppDialog as Alert } from "./dialog-service";
import React, { useState, useEffect } from "react";
import { View } from "react-native";
import {
  Plus,
  Pencil,
  Trash2,
  TriangleAlert,
  IndianRupee,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { prepareBannerImage } from "./banner-image";
import { api } from "./api";
import { useAuth, useLoad, alertError } from "./state";
import {
  C,
  T,
  Button,
  Input,
  Select,
  SectionTitle,
  SearchInput,
  Loading,
  ErrorView,
  Empty,
  Sheet,
  Page,
  Card,
  money,
  Notice,
} from "./ui";
import {
  NativeTable,
  TableRow,
  Cell,
  Pagination,
  StatGrid,
} from "./admin-common";
import { StockDonut, CategoryBars } from "./charts";
import { ImportButton } from "./import-ui";
import { ProductArt } from "./art";
import type { Product, Category, InventoryReport, Artwork } from "./types";
const blank = () => ({
  sku: "",
  name: "",
  categoryId: "",
  price: "",
  mrp: "",
  cost: "0",
  stock: "0",
  lowStockThreshold: "5",
  unit: "1 unit",
  imageUrl: "",
  barcode: "",
  artwork: "bag" as Artwork,
});
export function InventoryScreen() {
  const { epoch, bump } = useAuth();
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [low, setLow] = useState(false),
    [editing, setEditing] = useState<Product | null>(null),
    [open, setOpen] = useState(false),
    [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false),
    [categoryName, setCategoryName] = useState(""),
    [showCategory, setShowCategory] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const products = useLoad<{ products: Product[]; total: number }>(
    () =>
      api.get(
        `/api/admin/inventory?limit=30&offset=${offset}&q=${encodeURIComponent(search)}&low=${low}`,
      ),
    [epoch, search, offset, low],
  );
  const report = useLoad<InventoryReport>(
    () => api.get("/api/admin/reports/inventory"),
    [epoch],
  );
  const categories = useLoad<{ categories: Category[] }>(
    () => api.get("/api/catalog/categories"),
    [epoch],
  );
  const update = (key: keyof ReturnType<typeof blank>, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const [photoUri, setPhotoUri] = useState("");
  const pickPhoto = async () => {
    setBusy(true);
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (!selected.canceled)
        setPhotoUri(
          await prepareBannerImage(selected.assets[0].uri, "product photo"),
        );
    } catch (error) {
      alertError(error);
    } finally {
      setBusy(false);
    }
  };
  const openForm = (p: Product | null) => {
    setEditing(p);
    setPhotoUri("");
    setOpen(true);
    setShowCategory(false);
    setForm(
      p
        ? {
            sku: p.sku,
            name: p.name,
            categoryId: p.categoryId,
            price: String(p.price / 100),
            mrp: String(p.mrp / 100),
            cost: String((p.cost || 0) / 100),
            stock: String(p.stock || 0),
            lowStockThreshold: String(p.lowStockThreshold),
            unit: p.unit,
            imageUrl: p.merchantImageUrl ?? p.imageUrl,
            barcode: p.barcode || "",
            artwork: p.artwork,
          }
        : { ...blank(), categoryId: categories.data?.categories[0]?.id || "" },
    );
  };
  const save = async () => {
    setBusy(true);
    try {
      const d = {
        ...form,
        price: Number(form.price),
        mrp: Number(form.mrp),
        cost: Number(form.cost),
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold),
      };
      if (
        !form.sku ||
        !form.name ||
        !form.price ||
        !form.mrp ||
        !form.categoryId
      )
        throw new Error("Fill SKU, name, category, selling price and MRP.");
      const saved = editing
        ? await api.put<{ product: Product }>(
            `/api/admin/inventory/${editing.id}`,
            d,
          )
        : await api.post<{ product: Product }>("/api/admin/inventory", d);
      // Retain the saved ID if an upload fails, so retry does not create a duplicate.
      setEditing(saved.product);
      if (photoUri) {
        const upload = new FormData();
        upload.append("file", new File(photoUri), "product.jpg");
        await api.request(`/api/admin/inventory/${saved.product.id}/photo`, {
          method: "POST",
          body: upload,
        });
      }
      setOpen(false);
      bump();
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = (p: Product) =>
    Alert.alert(
      "Hide this product?",
      `${p.name} will be removed from the shop. Existing orders and invoices keep their records.`,
      [
        { text: "Keep product", style: "cancel" },
        {
          text: "Hide product",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/admin/inventory/${p.id}`);
              bump();
            } catch (e) {
              alertError(e);
            }
          },
        },
      ],
    );
  const addCategory = async () => {
    try {
      const r = await api.post("/api/admin/inventory/categories", {
        name: categoryName,
      });
      setForm((f) => ({ ...f, categoryId: r.category.id }));
      setCategoryName("");
      setShowCategory(false);
      categories.refresh();
    } catch (e) {
      alertError(e);
    }
  };
  const stats = report.data?.stats;
  return (
    <Page
      refresh={() => {
        products.refresh();
        report.refresh();
      }}
      refreshing={products.loading && !!products.data}
    >
      <SectionTitle
        title="Manage inventory"
        caption="Keep your shelves ready for the neighbourhood."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button
          title="Add product"
          onPress={() => openForm(null)}
          icon={<Plus size={16} color={C.white} />}
        />
        <ImportButton type="products" onComplete={bump} />
        <Button
          title={low ? "Show all products" : "Show low stock"}
          variant="ghost"
          onPress={() => {
            setLow(!low);
            setOffset(0);
          }}
        />
      </View>
      {report.error ? (
        <ErrorView error={report.error} retry={report.refresh} />
      ) : (
        stats && (
          <>
            <StatGrid
              items={[
                {
                  title: "Stock value",
                  value: money(stats.costValue),
                  note: "At recorded cost",
                  icon: <IndianRupee size={16} color={C.forest} />,
                },
                {
                  title: "Low stock",
                  value: String(stats.lowStock),
                  note: "Available stock at or below threshold",
                  icon: <TriangleAlert size={16} color={C.amber} />,
                },
              ]}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
              <Card style={{ flex: 1, minWidth: 270 }}>
                <T bold style={{ marginBottom: 18 }}>
                  Shelf health
                </T>
                <StockDonut
                  available={stats.units - stats.reservedUnits}
                  reserved={stats.reservedUnits}
                />
              </Card>
              <Card style={{ flex: 1, minWidth: 270 }}>
                <T bold style={{ marginBottom: 18 }}>
                  Available stock by category
                </T>
                <CategoryBars
                  data={report.data!.categories.map((c) => ({
                    name: c.name,
                    value: c.available,
                  }))}
                />
              </Card>
            </View>
          </>
        )
      )}
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by product name or SKU..."
      />
      {products.error ? (
        <ErrorView error={products.error} retry={products.refresh} />
      ) : products.loading && !products.data ? (
        <Loading />
      ) : products.data?.products.length ? (
        <NativeTable
          headers={[
            "Product",
            "Price / cost",
            "Available",
            "Reserved",
            "Shelf status",
            "Actions",
          ]}
          widths={[300, 145, 105, 105, 140, 110]}
        >
          {products.data.products.map((p) => (
            <TableRow key={p.id}>
              <Cell width={300}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <ProductArt
                    name={p.name}
                    category={p.category}
                    productId={p.id}
                    unit={p.unit}
                    sku={p.sku}
                    barcode={p.barcode}
                    imageThumbnailUrl={p.imageThumbnailUrl}
                    imageSource={p.imageSource}
                    artwork={p.artwork}
                    imageUrl={p.imageUrl}
                    width={51}
                    height={48}
                  />
                  <View style={{ flex: 1 }}>
                    <T bold size={13}>
                      {p.name}
                    </T>
                    <T size={10} color={C.muted} style={{ marginTop: 5 }}>
                      {p.sku} · {p.unit}
                    </T>
                  </View>
                </View>
              </Cell>
              <Cell width={145}>
                <T bold size={14}>
                  {money(p.price)}
                </T>
                <T size={10} color={C.muted} style={{ marginTop: 4 }}>
                  Cost {money(p.cost || 0)}
                </T>
              </Cell>
              <Cell width={105}>
                <T bold size={17}>
                  {p.available}
                </T>
              </Cell>
              <Cell width={105}>
                <T size={13} color={C.muted}>
                  {p.reserved || 0}
                </T>
              </Cell>
              <Cell width={140}>
                <View
                  style={{
                    backgroundColor:
                      p.available <= p.lowStockThreshold
                        ? "#FAF0DA"
                        : "#EBF4E3",
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    alignSelf: "flex-start",
                  }}
                >
                  <T
                    bold
                    size={10}
                    color={
                      p.available <= p.lowStockThreshold ? C.amber : C.forest
                    }
                  >
                    {!p.available
                      ? "Out of stock"
                      : p.available <= p.lowStockThreshold
                        ? "Low stock"
                        : "In stock"}
                  </T>
                </View>
              </Cell>
              <Cell width={110}>
                <View style={{ flexDirection: "row", gap: 18 }}>
                  <Pressable
                    accessibilityLabel={`Edit ${p.name}`}
                    hitSlop={10}
                    onPress={() => openForm(p)}
                  >
                    <Pencil size={17} color={C.forest} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Hide ${p.name}`}
                    hitSlop={10}
                    onPress={() => remove(p)}
                  >
                    <Trash2 size={17} color={C.red} />
                  </Pressable>
                </View>
              </Cell>
            </TableRow>
          ))}
        </NativeTable>
      ) : (
        <Empty
          title="Your shelves are waiting"
          detail="Add a product or import your inventory CSV."
        />
      )}
      <Pagination
        offset={offset}
        total={products.data?.total || 0}
        onChange={setOffset}
      />
      <Sheet
        visible={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={editing ? "Edit product" : "Add a product"}
      >
        <Input
          label="Product name"
          value={form.name}
          onChangeText={(v) => update("name", v)}
        />
        <Input
          label="SKU / product code"
          value={form.sku}
          onChangeText={(v) => update("sku", v)}
          autoCapitalize="characters"
        />
        <Select
          label="Category"
          value={form.categoryId}
          options={
            categories.data?.categories.map((c) => ({
              label: c.name,
              value: c.id,
            })) || []
          }
          onChange={(v) => update("categoryId", v)}
        />
        <Button
          title="Add a category"
          variant="ghost"
          onPress={() => setShowCategory((v) => !v)}
        />
        {showCategory && (
          <View>
            <Input
              label="New category name"
              value={categoryName}
              onChangeText={setCategoryName}
            />
            <Button
              title="Create category"
              variant="secondary"
              onPress={() => void addCategory()}
            />
            <View style={{ height: 15 }} />
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[
            ["price", "Price (₹)"],
            ["mrp", "MRP (₹)"],
            ["cost", "Cost (₹)"],
          ].map(([k, label]) => (
            <View key={k} style={{ flex: 1 }}>
              <Input
                label={label}
                value={form[k as "price" | "mrp" | "cost"]}
                onChangeText={(v) => update(k as "price" | "mrp" | "cost", v)}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Total on-hand stock"
              value={form.stock}
              onChangeText={(v) => update("stock", v)}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Low-stock threshold"
              value={form.lowStockThreshold}
              onChangeText={(v) => update("lowStockThreshold", v)}
              keyboardType="number-pad"
            />
          </View>
        </View>
        {editing?.reserved ? (
          <View style={{ marginBottom: 15 }}>
            <Notice
              text={`${editing.reserved} units are reserved for orders. Stock cannot be lower than this.`}
            />
          </View>
        ) : null}
        <Input
          label="Pack size / unit"
          value={form.unit}
          onChangeText={(v) => update("unit", v)}
          placeholder="1 kg / 500 ml / 6 pieces"
        />
        <Input
          label="Barcode / EAN (automatic product photo)"
          value={form.barcode}
          onChangeText={(v) => update("barcode", v)}
          keyboardType="number-pad"
          placeholder="Scan or enter the product's actual barcode"
        />
        <Input
          label="Product image URL (HTTPS, optional)"
          value={form.imageUrl}
          onChangeText={(v) => update("imageUrl", v)}
          keyboardType="url"
          autoCapitalize="none"
        />
        <Button
          title={photoUri ? "Change selected photo" : "Upload product photo"}
          variant="secondary"
          onPress={() => void pickPhoto()}
          disabled={busy}
        />
        {photoUri ? (
          <View style={{ alignItems: "center", marginVertical: 12 }}>
            <ProductArt
              name={form.name}
              imageUrl={photoUri}
              width={160}
              height={160}
            />
          </View>
        ) : null}
        <Notice
          text={
            photoUri
              ? "This photo will be saved with the product."
              : "Photos are matched by barcode or product name. For a missing or incorrect match, upload the actual product photo once."
          }
        />
        <Select
          label="Category artwork"
          value={form.artwork}
          onChange={(v) => update("artwork", v)}
          options={[
            "rice",
            "milk",
            "oil",
            "fruit",
            "vegetable",
            "soap",
            "bread",
            "bag",
            "snack",
            "tea",
          ].map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v }))}
        />
        <Button title="Save product" onPress={save} loading={busy} />
      </Sheet>
    </Page>
  );
}
