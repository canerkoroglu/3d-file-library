# Modelist STL Viewer

A desktop application for organizing and viewing 3D printing files (STL, 3MF, OBJ). Inspired by [Modelist](https://modelist.app/).

## Features

- **Multi-format support**: STL, 3MF, and OBJ files
- **Gallery view**: Visual grid with auto-generated thumbnails
- **3D viewer**: Interactive Three.js-powered model viewer
- **Smart organization**: Collections, tags, and watched folders
- **Powerful search**: Find files quickly by name
- **Cross-platform**: Works on macOS, Windows, and Linux

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI library
- **Three.js** - 3D rendering
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **SQLite** - Local database
- **Vite** - Build tool

## Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

### Building for Production

```bash
# Build for macOS
npm run build:mac

# Build for Windows  
npm run build:win

# Build for Linux
npm run build:linux
```

## Project Structure

```
stl-viewer/
├── electron/          # Electron main process
│   ├── main.ts       # Main entry point
│   ├── preload.ts    # Preload script
│   ├── database.ts   # SQLite database
│   └── ipcHandlers.ts # IPC communication
├── src/              # React renderer process
│   ├── components/   # UI components
│   ├── store/        # Zustand state management
│   ├── types/        # TypeScript types
│   └── styles/       # Global styles
└── public/           # Static assets
```

## Usage

### Importing Files

1. Click "Import Files" button in the filter bar
2. Select one or more 3D model files
3. Files will be automatically added to your library

### Watching Folders

1. Click the "+" icon in the "Watched Folders" section
2. Select a folder to monitor
3. New files added to that folder will be automatically imported

### Tagging Models

1. Click on a model to open the 3D viewer
2. In the side panel, click on tags to add/remove them
3. Use tag filters in the top bar to filter models

### Viewing Models

- Click any model card to open the 3D viewer
- Use mouse to orbit, zoom, and pan the camera
- View model information in the side panel

## License

MIT

## Credits

Inspired by [Modelist](https://modelist.app/) - the original 3D printing library organizer.
