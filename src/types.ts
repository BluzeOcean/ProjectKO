export type {
  WorkspaceBoard as Board, WorkspacePage as Page, WorkspaceTab as Tab,
  VaultRegistry, BoardTag, PageTag, TabLayout, TabBlock, SectionBlock, CardBlock, TabDocument, CardStatus, BoardStatus, BoardChat,
} from '../desktop/service/vault-schema.mjs'

/* --- 3D comparison tabs ------------------------------------------------
   A manifest lives inside the page folder next to a models/ directory. Paths
   in 'file' are relative to the manifest. Model binaries stay local
   (gitignored, they run to tens of MB) - the manifest and the tab are what
   get versioned. */

export interface Compare3DModel {
  /** Path to the .glb, relative to the manifest file. */
  file: string
  /** Shown above the pane - the generator name and version. */
  label: string
  /** Logo shown next to the label, relative to the manifest file. */
  logo?: string
  /** Optional second line: version, settings, generation time. */
  note?: string
  /** Optional colour for the pane label. */
  accent?: string
  /** Extra yaw in degrees, for exports that come out facing the wrong way. */
  rotationY?: number
  /** Cover name shown instead of 'label' while Redact is on. */
  alias?: string
}

export interface Compare3DTest {
  id: string
  name: string
  kind: 'lowpoly' | 'highpoly'
  defaultMode?: 'wire' | 'quads' | 'solid' | 'normals' | 'pbr' | 'albedo' | 'normalMap' | 'rough' | 'metal'
  note?: string
  input?: string
  models: Compare3DModel[]
}

export interface Compare3DManifest {
  title?: string
  tests: Compare3DTest[]
}
