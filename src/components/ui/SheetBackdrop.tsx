import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Scrim + bottom anchor for sheets rendered inside a <Modal transparent>. It's a
// KeyboardAvoidingView rather than a plain View because these sheets sit against the
// bottom edge — exactly where the keyboard opens — so without this the whole sheet
// (inputs included) is hidden the moment a field is focused. Padding behavior lifts
// it by the keyboard's height; on Android the window already resizes.
export function SheetBackdrop({ children, style }: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.backdrop, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
});
