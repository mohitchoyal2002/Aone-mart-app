import { SuccessCelebration } from "./success-celebration";
import { useMotion, ActionPressable as Pressable } from "./motion";
import React, { useSyncExternalStore } from "react";
import { Modal, View } from "react-native";
import { Check, AlertCircle, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dialogStore } from "./dialog-service";
import { C, T, Button } from "./ui";
import { BrandMark } from "./brand";
import { FormScroll } from "./keyboard-layout";

export function DialogHost() {
  const dialog = useSyncExternalStore(
    dialogStore.subscribe,
    dialogStore.snapshot,
    dialogStore.snapshot,
  );
  const insets = useSafeAreaInsets();
  const { reduced } = useMotion();
  const cancel = () =>
    dialogStore.close(
      dialog?.actions.find((action) => action.style === "cancel"),
    );
  const error =
    dialog?.tone === "error" ||
    dialog?.actions.some((action) => action.style === "destructive");
  return (
    <Modal
      visible={!!dialog}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={cancel}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          backgroundColor: "rgba(12,24,43,.55)",
        }}
      >
        {dialog && (
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: "90%",
              width: "100%",
              maxWidth: 460,
              alignSelf: "center",
              borderRadius: 30,
              padding: 24,
              backgroundColor: C.canvas,
              borderWidth: 1,
              borderColor: C.white,
            }}
          >
            <FormScroll contentContainerStyle={{ gap: 18 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <BrandMark size={55} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  onPress={cancel}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: C.white,
                    borderRadius: 22,
                  }}
                >
                  <X size={20} color={C.muted} />
                </Pressable>
              </View>
              {dialog.tone === "success" && <SuccessCelebration />}
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                {error ? (
                  <AlertCircle color={C.red} size={22} />
                ) : (
                  <Check color={C.forest} size={22} />
                )}
                <T size={23} bold style={{ flex: 1 }}>
                  {dialog.title}
                </T>
              </View>
              <T size={15} color={C.muted} style={{ lineHeight: 23 }}>
                {dialog.message}
              </T>
              <View style={{ gap: 9, marginTop: 4 }}>
                {dialog.actions.map((action, index) => (
                  <Button
                    key={index}
                    title={action.text || "Okay"}
                    variant={
                      action.style === "cancel"
                        ? "secondary"
                        : action.style === "destructive"
                          ? "danger"
                          : "primary"
                    }
                    onPress={() => dialogStore.close(action)}
                  />
                ))}
              </View>
            </FormScroll>
          </View>
        )}
      </View>
    </Modal>
  );
}
