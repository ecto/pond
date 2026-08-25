"""
Enhanced PCB generator with full KiCad compliance.

This module extends the base PCB generator with:
- Unique UUID generation for all elements
- Net definitions and netclass assignments
- PCB stackup for manufacturing
- Component pads with net assignments
- Thermal relief settings
"""

import os
import math
from typing import List, Tuple, Optional, Dict
from models.stators.kicad_utils import (
    UUIDGenerator, NetManager, NetClassManager,
    create_common_nets, assign_net_classes_auto,
    format_coordinate
)


class EnhancedPCBWriter:
    """Enhanced PCB file writer with full KiCad compliance."""

    def __init__(self, params, uuid_gen: UUIDGenerator, net_mgr: NetManager, netclass_mgr: NetClassManager):
        self.params = params
        self.uuid_gen = uuid_gen
        self.net_mgr = net_mgr
        self.netclass_mgr = netclass_mgr

    def write_header(self, f):
        """Write PCB file header."""
        f.write('(kicad_pcb (version 20221018) (generator pcbnew)\n\n')

        # General section
        f.write('  (general\n')
        f.write(f'    (thickness {self.params.pcb_thickness})\n')
        f.write('  )\n\n')

        # Paper size
        f.write('  (paper "A4")\n\n')

    def write_layers(self, f):
        """Write layer definitions."""
        f.write('  (layers\n')
        layers = [
            (0, "F.Cu", "signal"),
            (1, "In1.Cu", "signal"),
            (2, "In2.Cu", "signal"),
            (31, "B.Cu", "signal"),
            (32, "B.Adhes", "user", "B.Adhesive"),
            (33, "F.Adhes", "user", "F.Adhesive"),
            (34, "B.Paste", "user"),
            (35, "F.Paste", "user"),
            (36, "B.SilkS", "user", "B.Silkscreen"),
            (37, "F.SilkS", "user", "F.Silkscreen"),
            (38, "B.Mask", "user"),
            (39, "F.Mask", "user"),
            (40, "Dwgs.User", "user", "User.Drawings"),
            (41, "Cmts.User", "user", "User.Comments"),
            (42, "Eco1.User", "user", "User.Eco1"),
            (43, "Eco2.User", "user", "User.Eco2"),
            (44, "Edge.Cuts", "user"),
            (45, "Margin", "user"),
            (46, "B.CrtYd", "user", "B.Courtyard"),
            (47, "F.CrtYd", "user", "F.Courtyard"),
            (48, "B.Fab", "user"),
            (49, "F.Fab", "user"),
        ]

        for layer in layers:
            if len(layer) == 3:
                num, name, type_ = layer
                f.write(f'    ({num} "{name}" {type_})\n')
            else:
                num, name, type_, canonical = layer
                f.write(f'    ({num} "{name}" {type_} "{canonical}")\n')

        f.write('  )\n\n')

    def write_setup(self, f):
        """Write setup section with design rules."""
        f.write('  (setup\n')
        f.write('    (pad_to_mask_clearance 0)\n')
        f.write('    (solder_mask_min_width 0)\n')
        f.write('    (pad_to_paste_clearance 0)\n')
        f.write('    (aux_axis_origin 0 0)\n')
        f.write('    (grid_origin 0 0)\n')
        f.write('    (pcbplotparams\n')
        f.write('      (layerselection 0x00010fc_ffffffff)\n')
        f.write('      (plot_on_all_layers_selection 0x0000000_00000000)\n')
        f.write('      (disableapertmacros false)\n')
        f.write('      (usegerberextensions false)\n')
        f.write('      (usegerberattributes true)\n')
        f.write('      (usegerberadvancedattributes true)\n')
        f.write('      (creategerberjobfile true)\n')
        f.write('      (dashed_line_dash_ratio 12.000000)\n')
        f.write('      (dashed_line_gap_ratio 3.000000)\n')
        f.write('      (svgprecision 4)\n')
        f.write('      (plotframeref false)\n')
        f.write('      (viasonmask false)\n')
        f.write('      (mode 1)\n')
        f.write('      (useauxorigin false)\n')
        f.write('      (hpglpennumber 1)\n')
        f.write('      (hpglpenspeed 20)\n')
        f.write('      (hpglpendiameter 15.000000)\n')
        f.write('      (dxfpolygonmode true)\n')
        f.write('      (dxfimperialunits true)\n')
        f.write('      (dxfusepcbnewfont true)\n')
        f.write('      (psnegative false)\n')
        f.write('      (psa4output false)\n')
        f.write('      (plotreference true)\n')
        f.write('      (plotvalue true)\n')
        f.write('      (plotinvisibletext false)\n')
        f.write('      (sketchpadsonfab false)\n')
        f.write('      (subtractmaskfromsilk false)\n')
        f.write('      (outputformat 1)\n')
        f.write('      (mirror false)\n')
        f.write('      (drillshape 1)\n')
        f.write('      (scaleselection 1)\n')
        f.write('      (outputdirectory "")\n')
        f.write('    )\n')
        f.write('  )\n\n')

    def write_nets(self, f):
        """Write net definitions."""
        self.net_mgr.write_net_definitions(f)

    def write_netclasses(self, f):
        """Write netclass definitions."""
        # Get all unique netclasses
        netclasses = {}
        for net_name, net_num in self.net_mgr.get_all_nets().items():
            nc = self.netclass_mgr.get_netclass(net_name)
            if nc not in netclasses:
                netclasses[nc] = []
            if net_name:  # Don't add empty string
                netclasses[nc].append(net_name)

        # Write each netclass
        for nc_name, net_names in netclasses.items():
            if nc_name == "Default":
                f.write(f'  (net_class "Default" "This is the default net class."\n')
                f.write('    (clearance 0.2)\n')
                f.write('    (trace_width 0.25)\n')
                f.write('    (via_dia 0.8)\n')
                f.write('    (via_drill 0.4)\n')
                f.write('    (uvia_dia 0.3)\n')
                f.write('    (uvia_drill 0.1)\n')
            elif nc_name == "Power":
                f.write(f'  (net_class "Power" "Power nets"\n')
                f.write('    (clearance 0.5)\n')
                f.write('    (trace_width 1.5)\n')
                f.write('    (via_dia 1.2)\n')
                f.write('    (via_drill 0.6)\n')
                f.write('    (uvia_dia 0.6)\n')
                f.write('    (uvia_drill 0.3)\n')
            elif nc_name == "HighCurrent":
                f.write(f'  (net_class "HighCurrent" "High current nets"\n')
                f.write('    (clearance 0.3)\n')
                f.write('    (trace_width 2.0)\n')
                f.write('    (via_dia 1.5)\n')
                f.write('    (via_drill 0.8)\n')
                f.write('    (uvia_dia 0.8)\n')
                f.write('    (uvia_drill 0.4)\n')
            elif nc_name == "Signal":
                f.write(f'  (net_class "Signal" "Signal nets"\n')
                f.write('    (clearance 0.15)\n')
                f.write('    (trace_width 0.2)\n')
                f.write('    (via_dia 0.6)\n')
                f.write('    (via_drill 0.3)\n')
                f.write('    (uvia_dia 0.3)\n')
                f.write('    (uvia_drill 0.1)\n')

            # Add net assignments
            for net_name in sorted(net_names):
                f.write(f'    (add_net "{net_name}")\n')

            f.write('  )\n\n')

    def write_stackup(self, f):
        """Write PCB stackup definition for manufacturing."""
        f.write('  (stackup\n')

        # Calculate copper thickness from oz
        copper_thickness = self.params.copper_weight_oz * 0.035  # mm (1 oz = 0.035mm)

        # Top layers
        f.write('    (layer "F.SilkS" (type "Top Silk Screen"))\n')
        f.write('    (layer "F.Paste" (type "Top Solder Paste"))\n')
        f.write('    (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))\n')
        f.write(f'    (layer "F.Cu" (type "copper") (thickness {copper_thickness}))\n')

        # Dielectric 1
        dielectric_1 = (self.params.pcb_thickness - 4 * copper_thickness - 0.02) / 3
        f.write(f'    (layer "dielectric 1" (type "prepreg") (thickness {dielectric_1:.3f}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))\n')

        # Inner layer 1
        f.write(f'    (layer "In1.Cu" (type "copper") (thickness {copper_thickness}))\n')

        # Dielectric 2 (core)
        f.write(f'    (layer "dielectric 2" (type "core") (thickness {dielectric_1:.3f}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))\n')

        # Inner layer 2
        f.write(f'    (layer "In2.Cu" (type "copper") (thickness {copper_thickness}))\n')

        # Dielectric 3
        f.write(f'    (layer "dielectric 3" (type "prepreg") (thickness {dielectric_1:.3f}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))\n')

        # Bottom layers
        f.write(f'    (layer "B.Cu" (type "copper") (thickness {copper_thickness}))\n')
        f.write('    (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))\n')
        f.write('    (layer "B.Paste" (type "Bottom Solder Paste"))\n')
        f.write('    (layer "B.SilkS" (type "Bottom Silk Screen"))\n')

        f.write('    (copper_finish "None")\n')
        f.write('    (dielectric_constraints no)\n')
        f.write('  )\n\n')

    def write_segment(self, f, x1: float, y1: float, x2: float, y2: float, width: float, layer: str, net: int):
        """Write a track segment with UUID and net."""
        uuid = self.uuid_gen.generate()
        f.write(f'  (segment (start {format_coordinate(x1)} {format_coordinate(y1)}) ')
        f.write(f'(end {format_coordinate(x2)} {format_coordinate(y2)}) ')
        f.write(f'(width {width}) (layer "{layer}") (net {net}) (tstamp {uuid}))\n')

    def write_via(self, f, x: float, y: float, size: float, drill: float, net: int):
        """Write a via with UUID and net."""
        uuid = self.uuid_gen.generate()
        f.write(f'  (via (at {format_coordinate(x)} {format_coordinate(y)}) ')
        f.write(f'(size {size}) (drill {drill}) ')
        f.write(f'(layers "F.Cu" "B.Cu") (net {net}) (tstamp {uuid}))\n')

    def write_zone(self, f, net: int, net_name: str, layer: str, center: Tuple[float, float], radius: float):
        """Write a filled zone (copper pour) with proper settings."""
        uuid = self.uuid_gen.generate()
        x, y = center

        f.write(f'  (zone (net {net}) (net_name "{net_name}") (layer "{layer}") (tstamp {uuid}) (hatch edge 0.5)\n')
        f.write('    (connect_pads (clearance 0.5))\n')
        f.write('    (min_thickness 0.25) (filled_areas_thickness no)\n')
        f.write('    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))\n')
        f.write('    (polygon\n')
        f.write('      (pts\n')

        # Generate circle as polygon (36 segments)
        for i in range(37):
            angle = i * 2 * math.pi / 36
            px = x + radius * math.cos(angle)
            py = y + radius * math.sin(angle)
            f.write(f'        (xy {format_coordinate(px)} {format_coordinate(py)})\n')

        f.write('      )\n')
        f.write('    )\n')
        f.write('  )\n\n')

