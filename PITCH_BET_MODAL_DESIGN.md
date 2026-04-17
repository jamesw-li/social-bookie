# Pitch Bet Modal Design Specification

This document captures the design and styling choices of the "Pitch Bet" modal in `DashboardScreen.tsx` to serve as a reference for future modal development.

## 1. Container & Overlay
- **Type:** Full-screen `Modal` with `transparent={true}` and `animationType="slide"`.
- **Overlay:** `KeyboardAvoidingView` using `styles.modalOverlay`.
  - `flex: 1`
  - `justifyContent: 'flex-end'` (Creates the "Bottom Sheet" effect)
  - `backgroundColor: 'rgba(0,0,0,0.6)'` (Dimmed background)

## 2. Modal Content Box
- **Style:** `styles.modalContent`
- **Background:** `#1e1e1e` (Dark card theme)
- **Border Radius:** `borderTopLeftRadius: 20`, `borderTopRightRadius: 20` (Rounded top corners only)
- **Padding:** `25` (Generous internal spacing)
- **Bottom Handling:** Add extra padding for iOS Home Bar (`paddingBottom: 40`).

## 3. Modal Header
- **Style:** `styles.modalHeader`
- **Layout:** `flexDirection: 'row'`, `justifyContent: 'space-between'`, `alignItems: 'center'`
- **Spacing:** `marginBottom: 20`
- **Title:** `styles.modalTitle`
  - `fontSize: 20`
  - `fontWeight: 'bold'`
  - `color: '#fff'`
- **Cancel Button:** `TouchableOpacity` in the top-right corner.
  - Text Style: `styles.closeSlipText`
  - `color: '#ff4444'`
  - `fontWeight: 'bold'`
  - `fontSize: 16`

## 4. Visual Hierarchy (Semantic Colors)
To ensure the form is scannable, distinguish between instructions and primary labels:
- **Meta Labels (Instructions/Groupings):** (e.g., "Link to Action:", "Locking Policy")
  - `color: '#e0e0e0'`
  - `fontSize: 13`
  - `fontWeight: 'bold'`
  - `marginBottom: 8`
- **Primary Content Labels:** (e.g., "The Scenario", "The Question")
  - `color: '#fff'`
  - `fontSize: 14`
  - `fontWeight: 'bold'`
  - `marginBottom: 10`

## 5. Intentional Density
- **ScrollView:** Always wrap internal content in a `ScrollView`.
- **Capped Height:** `maxHeight: 400` to prevent the modal from overwhelming the screen and keep it feeling like a focused tool.
- **Tight Spacing:** Use `12px` to `15px` margins between major sections instead of large gaps.

## 6. Standardized Component Language
Every interactive element must follow the same "rules" to reduce visual noise:
- **Input Fields & Selectors:**
  - **Background:** `#121212` (Consistently darker than the content box)
  - **Border:** `1px solid #333`
  - **Radius:** `8`
  - **Padding:** `12` to `15`
  - **Text Color:** `#fff`
  - **Placeholder Color:** `#666`

## 7. Segmented Type Selectors
- **Row Style:** `styles.typeSelectorRow`
  - `flexDirection: 'row'`
  - `backgroundColor: '#121212'`
  - `padding: 4`
  - `borderRadius: 8`
  - `marginBottom: 15`
- **Button Style:** `styles.typeBtn` / `styles.typeBtnActive`
  - `flex: 1`
  - `paddingVertical: 8`
  - `alignItems: 'center'`
  - `borderRadius: 6`
- **Active State:** `backgroundColor: '#FFD700'` (Gold) or `#00D084` (Green)
- **Inactive State:** `color: '#a0a0a0'`

## 8. Primary Action Button (Submit)
- **Position:** Bottom of the modal, outside or below the ScrollView.
- **Background:** `#00D084` (Vibrant Green)
- **Radius:** `10`
- **Padding:** `paddingVertical: 15`
- **Alignment:** `alignItems: 'center'`, `justifyContent: 'center'` (Must be perfectly centered)
- **Margin:** `marginTop: 15`
- **Text:** Bold, Black (`#000`), `fontSize: 16` (Upper case for importance)

## 9. Color Palette Reference
- **Content Background:** `#1e1e1e`
- **Input/Field Background:** `#121212`
- **Primary Text:** `#ffffff`
- **Secondary Text (Meta Labels):** `#e0e0e0`
- **Muted Text (Inactive/Description):** `#666666` / `#a0a0a0`
- **Primary Action (Green):** `#00D084`
- **Primary Action (Gold):** `#FFD700`
- **Danger/Cancel (Red):** `#ff4444`
- **Blind Theme (Purple):** `#BB86FC`
