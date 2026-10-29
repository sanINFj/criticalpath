# Third-Party Open Source Software Notices and Licenses

This project, **ASAP (CriticalPath EDA)**, incorporates and depends on various open-source software libraries and external components. This document provides attribution and lists the respective licenses and disclaimers.

---

## 1. Native Simulation Engine

### ngspice
* **Project**: ngspice circuit simulator
* **Homepage**: https://ngspice.sourceforge.io/
* **License**: Mixed BSD / LGPL (SPICE3f5, Cider1b1, XSPICE)
* **Notice**:
  > ngspice is an open-source, mixed-level/mixed-signal circuit simulator based on SPICE3f5, Cider1b1, and XSPICE.
  > Portions Copyright (c) 1985-1991 The Regents of the University of California.
  > Portions Copyright (c) 1996-2024 ngspice team and contributors.
  >
  > Distributed under the BSD and GNU Lesser General Public License (LGPL). Source code and documentation are available at https://ngspice.sourceforge.io/.

---

## 2. Desktop Application Framework

### Electron
* **License**: MIT
* **Copyright**: Copyright (c) Electron contributors, OpenJS Foundation
* **Homepage**: https://www.electronjs.org/

### Vite & electron-vite
* **License**: MIT
* **Copyright**: Copyright (c) 2019-present Evan You & Vite contributors; Copyright (c) 2021-present Alex Wei
* **Homepage**: https://electron-vite.org/

### electron-builder
* **License**: MIT
* **Copyright**: Copyright (c) 2015-present Vladimir Krivosheev
* **Homepage**: https://www.electron-builder.org/

---

## 3. Frontend & User Interface Libraries

### React & React-DOM
* **License**: MIT
* **Copyright**: Copyright (c) Meta Platforms, Inc. and affiliates
* **Homepage**: https://react.dev/

### ReactFlow (@xyflow/react)
* **License**: MIT
* **Copyright**: Copyright (c) 2019-present webkid GmbH / Christopher Liew & Moritz Klack
* **Homepage**: https://reactflow.dev/

### Plotly.js & react-plotly.js
* **License**: MIT
* **Copyright**: Copyright (c) 2012-2024 Plotly, Inc.
* **Homepage**: https://plotly.com/javascript/

### Lucide React
* **License**: ISC
* **Copyright**: Copyright (c) 2022 Lucide Contributors
* **Homepage**: https://lucide.dev/

### i18next & react-i18next
* **License**: MIT
* **Copyright**: Copyright (c) 2024 i18next
* **Homepage**: https://www.i18next.com/

### PrismJS
* **License**: MIT
* **Copyright**: Copyright (c) 2012 Lea Verou
* **Homepage**: https://prismjs.com/

### react-markdown & remark-gfm
* **License**: MIT
* **Copyright**: Copyright (c) 2015 Espen Hovlandsdal, Titus Wormer
* **Homepage**: https://github.com/remarkjs/react-markdown

---

## 4. Python Scientific Libraries (Timing & Critical Path Analysis)

### NumPy
* **License**: BSD 3-Clause
* **Copyright**: Copyright (c) 2005-2024, NumPy Developers
* **Homepage**: https://numpy.org/

### Pandas
* **License**: BSD 3-Clause
* **Copyright**: Copyright (c) 2008-2024, AQR Capital Management, LLC, Lambda Foundry, Inc. and PyData Development Team
* **Homepage**: https://pandas.pydata.org/

### NetworkX
* **License**: BSD 3-Clause
* **Copyright**: Copyright (c) 2004-2024, NetworkX Developers
* **Homepage**: https://networkx.org/

---

## 5. Cloud AI Providers (External APIs)

### Google Gemini API
* **Terms of Service**: https://ai.google.dev/terms
* **Usage**: In-app AI Circuit Assistant utilizes user-configured API keys to access Gemini models (`gemini-2.5-flash`, `gemini-1.5-flash`).

### Groq Cloud API & Meta Llama 3
* **Terms of Service**: https://groq.com/terms-of-use/
* **Meta Llama 3 License**: https://llama.meta.com/llama3/license/
* **Usage**: Alternative LLM provider for rapid circuit analysis (`llama-3.3-70b-versatile`).

---

## Standard MIT License Text
```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
