// The mock backend runs unless VITE_USE_MOCKS is explicitly "false".
export const mocksEnabled = import.meta.env.VITE_USE_MOCKS !== 'false'
