import React, { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Upload, ArrowUp, ArrowDown } from "lucide-react-native";
import { api } from "./api";
import { AppDialog } from "./dialog-service";
import { useLoad, useAuth, alertError } from "./state";
import {
  C,
  T,
  Card,
  Button,
  Input,
  Sheet,
  Loading,
  ErrorView,
  Notice,
} from "./ui";
import type { Banner } from "./types";

export function BannerSettings() {
  const { bump } = useAuth();
  const result = useLoad<{ banners: Banner[] }>(
    () => api.get("/api/admin/settings/banners"),
    [],
  );
  const [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{
    uri: string;
    title: string;
    altText: string;
    id?: string;
  } | null>(null);
  const banners = result.data?.banners || [];
  const pick = async (banner?: Banner) => {
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (selected.canceled) return;
      setBusy(true);
      const asset = selected.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      // Compress locally before upload to stay below serverless request limits.
      if (asset.width > 1600 || asset.height > 1600)
        context.resize(
          asset.width >= asset.height ? { width: 1600 } : { height: 1600 },
        );
      const rendered = await context.renderAsync();
      const image = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.8,
      });
      setDraft({
        uri: image.uri,
        title: banner?.title || "",
        altText: banner?.altText || "",
        id: banner?.id,
      });
      setOpen(true);
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const changed = () => {
    result.refresh();
    bump();
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", draft.title.trim());
      form.append("altText", draft.altText.trim());
      form.append("file", {
        uri: draft.uri,
        name: "banner.jpg",
        type: "image/jpeg",
      } as any);
      await api.request(
        "/api/admin/settings/banners" + (draft.id ? `/${draft.id}` : ""),
        { method: draft.id ? "PUT" : "POST", body: form },
      );
      setOpen(false);
      setDraft(null);
      changed();
      AppDialog.alert(
        "Banner saved",
        "Your customer app will show the updated carousel.",
        undefined,
        { tone: "success" },
      );
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = (banner: Banner) =>
    AppDialog.alert("Remove this banner?", banner.title, [
      { text: "Keep banner", style: "cancel" },
      {
        text: "Remove banner",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.delete(`/api/admin/settings/banners/${banner.id}`);
            changed();
          } catch (e) {
            alertError(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  const reorder = async (position: number, direction: number) => {
    const ordered = banners.map((b) => b.id),
      target = position + direction;
    [ordered[position], ordered[target]] = [ordered[target], ordered[position]];
    setBusy(true);
    try {
      await api.patch("/api/admin/settings/banners/order", { ids: ordered });
      changed();
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <T size={20} bold>
        Home banners
      </T>
      <T
        size={14}
        color={C.muted}
        style={{ marginTop: 7, lineHeight: 21, marginBottom: 18 }}
      >
        Upload 1–5 images for your carousel. Wide images around 2:1 work well.
        Every image stays fully visible.
      </T>
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <View style={{ gap: 16 }}>
          {!banners.length && (
            <Notice text="Your home currently shows the Aone basket banner. Add your first image to replace it." />
          )}
          {banners.map((banner, index) => (
            <View
              key={banner.id}
              style={{
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 18,
                padding: 12,
                gap: 10,
              }}
            >
              <Image
                source={api.baseUrl + banner.imagePath}
                contentFit="contain"
                alt={banner.altText}
                style={{
                  height: 140,
                  width: "100%",
                  borderRadius: 12,
                  backgroundColor: C.canvas,
                }}
              />
              <T bold size={15}>
                {index + 1}. {banner.title}
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  title="Replace"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void pick(banner)}
                />
                <Button
                  title="Remove"
                  variant="danger"
                  disabled={busy || banners.length <= 1}
                  onPress={() => remove(banner)}
                />
                <Button
                  title="Up"
                  variant="ghost"
                  disabled={busy || index === 0}
                  onPress={() => void reorder(index, -1)}
                  icon={<ArrowUp size={16} color={C.forest} />}
                />
                <Button
                  title="Down"
                  variant="ghost"
                  disabled={busy || index === banners.length - 1}
                  onPress={() => void reorder(index, 1)}
                  icon={<ArrowDown size={16} color={C.forest} />}
                />
              </View>
            </View>
          ))}
          <Button
            title={`Add banner · ${banners.length}/5`}
            disabled={busy || banners.length >= 5}
            loading={busy && !open}
            onPress={() => void pick()}
            icon={<Upload size={17} color={C.white} />}
          />
        </View>
      )}
      <Sheet
        visible={open}
        title={draft?.id ? "Replace banner" : "Add a banner"}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setDraft(null);
          }
        }}
      >
        {draft && (
          <View style={{ gap: 12 }}>
            <Image
              source={draft.uri}
              contentFit="contain"
              style={{
                height: 170,
                width: "100%",
                borderRadius: 18,
                backgroundColor: C.mint,
              }}
            />
            <Input
              label="Banner title"
              value={draft.title}
              maxLength={100}
              onChangeText={(title) =>
                setDraft((current) => (current ? { ...current, title } : null))
              }
            />
            <Input
              label="Describe the offer or image"
              placeholder="For example: This week's rice and oil offers"
              value={draft.altText}
              maxLength={200}
              onChangeText={(altText) =>
                setDraft((current) =>
                  current ? { ...current, altText } : null,
                )
              }
            />
            <Button
              title="Save banner"
              disabled={
                draft.title.trim().length < 2 || draft.altText.trim().length < 2
              }
              loading={busy}
              onPress={() => void save()}
            />
          </View>
        )}
      </Sheet>
    </Card>
  );
}
