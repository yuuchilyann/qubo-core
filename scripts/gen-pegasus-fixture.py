"""
Writes the Pegasus fixtures that `npm run verify:embed` checks `src/hardware/pegasus.ts` against.

    pip install dwave-networkx
    python scripts/gen-pegasus-fixture.py

Run once, commit the output. The point of the fixture is that `verify:all` stays
stdlib-only: the TypeScript port is compared to what `dwave_networkx` actually
produced, without every run needing Ocean installed.

Each file holds the node set, the edge set and the `pegasus_layout` positions of
`dwave_networkx.pegasus_graph(m)` with its defaults (fabric_only, offsets_index 0,
integer labels). Floats are written with `repr`, which round-trips exactly.
"""

import json
import pathlib
import warnings

with warnings.catch_warnings():
    # dwave-networkx announces its move to dwave-graphs in Ocean 10; the graph is the same.
    warnings.simplefilter('ignore', DeprecationWarning)
    import dwave_networkx as dnx

SIZES = (2, 3, 4, 6)
OUT = pathlib.Path(__file__).resolve().parent.parent / 'fixtures'


def main():
    OUT.mkdir(exist_ok=True)
    for m in SIZES:
        G = dnx.pegasus_graph(m)
        pos = dnx.pegasus_layout(G)
        data = {
            'generator': f'dwave_networkx {dnx.__version__} pegasus_graph({m}) + pegasus_layout',
            'm': m,
            'nodes': sorted(G.nodes()),
            'edges': sorted(tuple(sorted(e)) for e in G.edges()),
            'pos': {str(v): [float(pos[v][0]), float(pos[v][1])] for v in sorted(G.nodes())},
        }
        path = OUT / f'pegasus-m{m}.json'
        path.write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')
        print(f'{path.name}: {len(data["nodes"])} qubits, {len(data["edges"])} couplers')


if __name__ == '__main__':
    main()
