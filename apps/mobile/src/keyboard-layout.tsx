import React, { forwardRef } from "react";
import {
  KeyboardAwareScrollView,
  KeyboardToolbar,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Leave room for the 42dp keyboard toolbar and a comfortable field gap.
export const KEYBOARD_CLEARANCE = 60;

export const FormScroll = forwardRef<
  KeyboardAwareScrollViewRef,
  React.ComponentProps<typeof KeyboardAwareScrollView>
>(function FormScroll(props, ref) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={KEYBOARD_CLEARANCE}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...props}
    />
  );
});

const palette = {
  primary: "#1E5C43",
  disabled: "#A2AAA2",
  background: "#FFFFFF",
  ripple: "#DDECBC",
};

export function KeyboardTools() {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardToolbar
      theme={{ light: palette, dark: palette }}
      insets={{ left: insets.left, right: insets.right }}
    >
      <KeyboardToolbar.Prev />
      <KeyboardToolbar.Next />
      <KeyboardToolbar.Done text="Done" />
    </KeyboardToolbar>
  );
}
