# Apex - Motorsport Intelligence Platform

Apex is a high-end motorsport analysis platform that dives deep into the strategy, telemetry, and human elements of Formula 1. It provides real-time signals, historical lap analysis, and in-depth stories on the technical evolution of the sport.

## Features

- **Magazine**: In-depth articles on F1 strategy, technical updates, and driver analysis.
- **Race Hub**: Live telemetry comparison (Speed, Throttle, ERS) between drivers with historical trend lines.
- **Lap History**: Granular lap-by-lap breakdown highlighting key events (lockups, tire degradation spikes, pit stops).
- **Strategy Timeline**: Visual comparison of pit stop strategies and tire life.
- **Signals**: Real-time intelligence flow based on live data triggers.

## Tech Stack

- **Framework**: React 19
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4
- **Animations**: Motion (motion/react)
- **Icons**: Lucide React
- **Language**: TypeScript

## Getting Started

Follow these instructions to set up the project locally in your IDE.

### Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (Version 18 or higher recommended)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

### Installation

1. **Clone or Download the Project**:
   If you have the files locally, navigate to the project root directory in your terminal.

2. **Install Dependencies**:
   Run the following command to install all necessary packages:
   ```bash
   npm install
   ```

### Running the Development Server

To start the app in development mode, run:
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

### Building for Production

To create an optimized production build, run:
```bash
npm run build
```
The output will be generated in the `dist/` directory.

### Other Commands

- **Linting**: Check for TypeScript errors:
  ```bash
  npm run lint
  ```
- **Preview**: Preview the production build locally:
  ```bash
  npm run preview
  ```

## Project Structure

- `src/`: Source code directory.
  - `components/`: Reusable UI components (Header, MobileNav, etc.).
  - `pages/`: Main application pages (Magazine, Race, Signals, Stories).
  - `constants.ts`: Global constants and mock data for articles/analysis.
  - `types.ts`: TypeScript interfaces and types.
- `public/`: Static assets.
- `index.html`: Entry HTML file.
- `package.json`: Project dependencies and scripts.
- `tsconfig.json`: TypeScript configuration.

## License

This project is licensed under the Apache-2.0 License.
