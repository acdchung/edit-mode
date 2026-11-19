import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import editMode from 'edit-mode';

export default defineConfig({
  plugins: [editMode(), react()],
});
