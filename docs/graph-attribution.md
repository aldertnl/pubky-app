# Graph Explorer code reuse

Arena reuses the renderer, canvas sprites/theme, graph primitives, stream-to-graph transform, canvas popup positioner, point tracking and fullscreen hook from [SHAcollision/pubky-app](https://github.com/SHAcollision/pubky-app/tree/e1486411473c2f3ad8817298b8a737e596963e17), branch `vibe/graph-explorer`.

Arena adds a bounded data adapter, ranking labels and an in-canvas inspector. The signed-in connection control reuses the shortest follow-path endpoint on demand; neighborhood expansion is not included. Explicit renderer memoization is retained from upstream because the imperative engine relies on stable callback and graph-object identities.

MIT License

Copyright (c) 2025 Pubky

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
