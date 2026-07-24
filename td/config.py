"""
Project configuration for the TD Web GUI bridge — the scene-loader GUI.

Everything project specific lives here. td/webserver-callbacks.py and
td/parameter-execute.py are drop-in copies that read these values back out via
op('config').module, so this is the only file you edit per project.

Setup: paste this into a Text DAT named `config`, beside the Web Server DAT's
callbacks DAT and the Parameter Execute DAT.

Backing operators this project expects:
	/GUI/ExternalScenes/SceneA … SceneH   custom pars `Text` (String), `Text2` (String)
	/GUI/GUI                              custom par `Selectedloader`

Set by hand, because they're parameters on the DATs rather than values read
from here:
	Parameter Execute DAT   OPs = `/GUI/ExternalScenes/Scene* /GUI/GUI`
	                        (space-separated pattern — one Parameter Execute DAT
	                        can watch several operators), Value Change and Custom
	                        enabled.
	Web Server DAT          Callbacks DAT = the callbacks DAT named below.
"""

# Name of, or path to, the Web Server DAT's callbacks DAT — the Parameter
# Execute DAT reads this to find the module it broadcasts through. TD op names
# can't contain hyphens, so this won't literally be "webserver-callbacks".
CALLBACKS = 'webserver1_callbacks'

# Identifies this TD project to the web app, sent in the `welcome` reply.
INSTANCE = 'example'

# The eight external scene loaders. Each exposes the same pair of text pars; the
# web app shows only the pair belonging to the loader `selectedLoader` points at.
SCENE_IDS = 'ABCDEFGH'
SCENE_PATH = '/GUI/ExternalScenes/Scene%s'

# friendly wire name -> backing parameter.
#   type: 'bool' | 'number' | 'string' | 'number[]' | 'pulse'
#     - 'number[]' entries reference the ParGroup's base name (e.g. 'Position'
#       for the tuple pars 'Positionx'/'Positiony'/'Positionz'); component
#       order there is the wire array order.
#     - 'pulse' entries hold no state: excluded from snapshot, written via a
#       dedicated `pulse` message (not `update`), and call par.pulse().
REGISTRY = {
	'selectedLoader': {'op': '/GUI/GUI', 'par': 'Selectedloader', 'type': 'string'},
}

# sceneAText1 / sceneAText2 … sceneHText1 / sceneHText2. The web app derives these
# same names from its scene id, so the two sides must agree on the spelling.
for _scene in SCENE_IDS:
	REGISTRY['scene%sText1' % _scene] = {'op': SCENE_PATH % _scene, 'par': 'Text', 'type': 'string'}
	REGISTRY['scene%sText2' % _scene] = {'op': SCENE_PATH % _scene, 'par': 'Text2', 'type': 'string'}
