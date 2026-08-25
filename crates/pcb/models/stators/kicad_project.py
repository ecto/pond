"""
KiCad project file (.kicad_pro) generator.

This module generates complete KiCad project files with proper design rules,
net classes, and all required settings for production-ready designs.
"""

import json
import os
from typing import List, Dict, Optional


class KiCadProjectGenerator:
    """Generate KiCad 7.0 .kicad_pro project files."""

    def __init__(self, project_name: str):
        self.project_name = project_name
        self.net_classes = []
        self.track_widths = [0.25, 0.5, 1.0, 2.0]
        self.via_dimensions = []

    def add_netclass(
        self,
        name: str,
        clearance: float = 0.2,
        track_width: float = 0.25,
        via_diameter: float = 0.8,
        via_drill: float = 0.4,
        diff_pair_width: float = 0.2,
        diff_pair_gap: float = 0.25
    ):
        """Add a net class definition."""
        self.net_classes.append({
            "bus_width": 12,
            "clearance": clearance,
            "diff_pair_gap": diff_pair_gap,
            "diff_pair_via_gap": 0.25,
            "diff_pair_width": diff_pair_width,
            "line_style": 0,
            "microvia_diameter": 0.3,
            "microvia_drill": 0.1,
            "name": name,
            "pcb_color": "rgba(0, 0, 0, 0.000)",
            "schematic_color": "rgba(0, 0, 0, 0.000)",
            "track_width": track_width,
            "via_diameter": via_diameter,
            "via_drill": via_drill,
            "wire_width": 6
        })

    def add_via_size(self, diameter: float, drill: float):
        """Add a via size option."""
        self.via_dimensions.append({
            "diameter": diameter,
            "drill": drill
        })

    def generate(self, output_path: str):
        """Generate complete .kicad_pro file."""

        # Ensure we have at least the default netclass
        if not self.net_classes:
            self.add_netclass("Default")

        # Ensure we have at least one via size
        if not self.via_dimensions:
            self.add_via_size(0.8, 0.4)

        project = {
            "board": {
                "3dviewports": [],
                "design_settings": {
                    "defaults": {
                        "board_outline_line_width": 0.1,
                        "copper_line_width": 0.2,
                        "copper_text_italic": False,
                        "copper_text_size_h": 1.5,
                        "copper_text_size_v": 1.5,
                        "copper_text_thickness": 0.3,
                        "copper_text_upright": False,
                        "courtyard_line_width": 0.05,
                        "dimension_precision": 4,
                        "dimension_units": 3,
                        "dimensions": {
                            "arrow_length": 1270000,
                            "extension_offset": 500000,
                            "keep_text_aligned": True,
                            "suppress_zeroes": False,
                            "text_position": 0,
                            "units_format": 1
                        },
                        "fab_line_width": 0.1,
                        "fab_text_italic": False,
                        "fab_text_size_h": 1.0,
                        "fab_text_size_v": 1.0,
                        "fab_text_thickness": 0.15,
                        "fab_text_upright": False,
                        "other_line_width": 0.15,
                        "other_text_italic": False,
                        "other_text_size_h": 1.0,
                        "other_text_size_v": 1.0,
                        "other_text_thickness": 0.15,
                        "other_text_upright": False,
                        "pads": {
                            "drill": 0.762,
                            "height": 1.524,
                            "width": 1.524
                        },
                        "silk_line_width": 0.15,
                        "silk_text_italic": False,
                        "silk_text_size_h": 1.0,
                        "silk_text_size_v": 1.0,
                        "silk_text_thickness": 0.15,
                        "silk_text_upright": False,
                        "zones": {
                            "min_clearance": 0.5
                        }
                    },
                    "diff_pair_dimensions": [],
                    "drc_exclusions": [],
                    "meta": {
                        "version": 2
                    },
                    "rule_severities": {
                        "annular_width": "error",
                        "clearance": "error",
                        "connection_width": "warning",
                        "copper_edge_clearance": "error",
                        "copper_sliver": "warning",
                        "courtyards_overlap": "error",
                        "diff_pair_gap_out_of_range": "error",
                        "diff_pair_uncoupled_length_too_long": "error",
                        "drill_out_of_range": "error",
                        "duplicate_footprints": "warning",
                        "extra_footprint": "warning",
                        "footprint": "error",
                        "footprint_type_mismatch": "ignore",
                        "hole_clearance": "error",
                        "hole_near_hole": "error",
                        "invalid_outline": "error",
                        "isolated_copper": "warning",
                        "item_on_disabled_layer": "error",
                        "items_not_allowed": "error",
                        "length_out_of_range": "error",
                        "lib_footprint_issues": "warning",
                        "lib_footprint_mismatch": "warning",
                        "malformed_courtyard": "error",
                        "microvia_drill_out_of_range": "error",
                        "missing_courtyard": "ignore",
                        "missing_footprint": "warning",
                        "net_conflict": "warning",
                        "npth_inside_courtyard": "ignore",
                        "padstack": "warning",
                        "pth_inside_courtyard": "ignore",
                        "shorting_items": "error",
                        "silk_edge_clearance": "warning",
                        "silk_over_copper": "warning",
                        "silk_overlap": "warning",
                        "skew_out_of_range": "error",
                        "solder_mask_bridge": "error",
                        "starved_thermal": "error",
                        "text_height": "warning",
                        "text_thickness": "warning",
                        "through_hole_pad_without_hole": "error",
                        "too_many_vias": "error",
                        "track_dangling": "warning",
                        "track_width": "error",
                        "tracks_crossing": "error",
                        "unconnected_items": "error",
                        "unresolved_variable": "error",
                        "via_dangling": "warning",
                        "zones_intersect": "error"
                    },
                    "rules": {
                        "max_error": 0.005,
                        "min_clearance": 0.2,
                        "min_connection": 0.0,
                        "min_copper_edge_clearance": 0.5,
                        "min_hole_clearance": 0.25,
                        "min_hole_to_hole": 0.25,
                        "min_microvia_diameter": 0.2,
                        "min_microvia_drill": 0.1,
                        "min_resolved_spokes": 2,
                        "min_silk_clearance": 0.0,
                        "min_text_height": 0.8,
                        "min_text_thickness": 0.08,
                        "min_through_hole_diameter": 0.3,
                        "min_track_width": 0.2,
                        "min_via_annular_width": 0.1,
                        "min_via_diameter": 0.5,
                        "solder_mask_clearance": 0.0,
                        "solder_mask_min_width": 0.0,
                        "solder_mask_to_copper_clearance": 0.0,
                        "use_height_for_length_calcs": True
                    },
                    "teardrop_options": [
                        {
                            "td_allow_use_two_tracks": True,
                            "td_curve_segcount": 5,
                            "td_on_pad_in_zone": False,
                            "td_onpadsmd": True,
                            "td_onroundshapesonly": False,
                            "td_ontrackend": False,
                            "td_onviapad": True
                        }
                    ],
                    "teardrop_parameters": [
                        {
                            "td_curve_segcount": 0,
                            "td_height_ratio": 1.0,
                            "td_length_ratio": 0.5,
                            "td_maxheight": 2.0,
                            "td_maxlen": 1.0,
                            "td_target_name": "td_round_shape",
                            "td_width_to_size_filter_ratio": 0.9
                        },
                        {
                            "td_curve_segcount": 0,
                            "td_height_ratio": 1.0,
                            "td_length_ratio": 0.5,
                            "td_maxheight": 2.0,
                            "td_maxlen": 1.0,
                            "td_target_name": "td_rect_shape",
                            "td_width_to_size_filter_ratio": 0.9
                        },
                        {
                            "td_curve_segcount": 0,
                            "td_height_ratio": 1.0,
                            "td_length_ratio": 0.5,
                            "td_maxheight": 2.0,
                            "td_maxlen": 1.0,
                            "td_target_name": "td_track_end",
                            "td_width_to_size_filter_ratio": 0.9
                        }
                    ],
                    "track_widths": self.track_widths,
                    "via_dimensions": self.via_dimensions,
                    "zones_allow_external_fillets": False
                },
                "layer_presets": [],
                "viewports": []
            },
            "boards": [],
            "cvpcb": {
                "equivalence_files": []
            },
            "erc": {
                "erc_exclusions": [],
                "meta": {
                    "version": 0
                },
                "pin_map": [
                    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2],
                    [0, 2, 0, 1, 0, 0, 1, 0, 2, 2, 2, 2],
                    [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 2],
                    [0, 1, 0, 0, 0, 0, 1, 1, 2, 1, 1, 2],
                    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2],
                    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
                    [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 2],
                    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 2],
                    [0, 2, 1, 2, 0, 0, 1, 0, 2, 2, 2, 2],
                    [0, 2, 0, 1, 0, 0, 1, 0, 2, 0, 0, 2],
                    [0, 2, 1, 1, 0, 0, 1, 0, 2, 0, 0, 2],
                    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
                ],
                "rule_severities": {
                    "bus_definition_conflict": "error",
                    "bus_entry_needed": "error",
                    "bus_to_bus_conflict": "error",
                    "bus_to_net_conflict": "error",
                    "conflicting_netclasses": "error",
                    "different_unit_footprint": "error",
                    "different_unit_net": "error",
                    "duplicate_reference": "error",
                    "duplicate_sheet_names": "error",
                    "endpoint_off_grid": "warning",
                    "extra_units": "error",
                    "global_label_dangling": "warning",
                    "hier_label_mismatch": "error",
                    "label_dangling": "error",
                    "lib_symbol_issues": "warning",
                    "missing_bidi_pin": "warning",
                    "missing_input_pin": "warning",
                    "missing_power_pin": "error",
                    "missing_unit": "warning",
                    "multiple_net_names": "warning",
                    "net_not_bus_member": "warning",
                    "no_connect_connected": "warning",
                    "no_connect_dangling": "warning",
                    "pin_not_connected": "error",
                    "pin_not_driven": "error",
                    "pin_to_pin": "warning",
                    "power_pin_not_driven": "error",
                    "similar_labels": "warning",
                    "simulation_model_issue": "ignore",
                    "unannotated": "error",
                    "unit_value_mismatch": "error",
                    "unresolved_variable": "error",
                    "wire_dangling": "error"
                }
            },
            "libraries": {
                "pinned_footprint_libs": [],
                "pinned_symbol_libs": []
            },
            "meta": {
                "filename": f"{self.project_name}.kicad_pro",
                "version": 1
            },
            "net_settings": {
                "classes": self.net_classes,
                "meta": {
                    "version": 3
                },
                "net_colors": None,
                "netclass_assignments": None,
                "netclass_patterns": []
            },
            "pcbnew": {
                "last_paths": {
                    "gencad": "",
                    "idf": "",
                    "netlist": "",
                    "specctra_dsn": "",
                    "step": "",
                    "vrml": ""
                },
                "page_layout_descr_file": ""
            },
            "schematic": {
                "annotate_start_num": 0,
                "drawing": {
                    "dashed_lines_dash_length_ratio": 12.0,
                    "dashed_lines_gap_length_ratio": 3.0,
                    "default_line_thickness": 6.0,
                    "default_text_size": 50.0,
                    "field_names": [],
                    "intersheets_ref_own_page": False,
                    "intersheets_ref_prefix": "",
                    "intersheets_ref_short": False,
                    "intersheets_ref_show": False,
                    "intersheets_ref_suffix": "",
                    "junction_size_choice": 3,
                    "label_size_ratio": 0.375,
                    "pin_symbol_size": 25.0,
                    "text_offset_ratio": 0.15
                },
                "legacy_lib_dir": "",
                "legacy_lib_list": [],
                "meta": {
                    "version": 1
                },
                "net_format_name": "",
                "page_layout_descr_file": "",
                "plot_directory": "",
                "spice_current_sheet_as_root": False,
                "spice_external_command": "spice \"%I\"",
                "spice_model_current_sheet_as_root": True,
                "spice_save_all_currents": False,
                "spice_save_all_voltages": False,
                "subpart_first_id": 65,
                "subpart_id_separator": 0
            },
            "sheets": [],
            "text_variables": {}
        }

        # Write JSON file
        with open(output_path, 'w') as f:
            json.dump(project, f, indent=2)

        print(f"  ✓ Generated project file: {os.path.basename(output_path)}")


def create_integrated_controller_project(project_name: str, bus_voltage: float) -> KiCadProjectGenerator:
    """Create a project configuration for integrated motor controller."""

    project = KiCadProjectGenerator(project_name)

    # Default netclass
    project.add_netclass(
        "Default",
        clearance=0.2,
        track_width=0.25,
        via_diameter=0.8,
        via_drill=0.4
    )

    # Power netclass (wider traces, larger clearance)
    if bus_voltage >= 24:
        power_clearance = 0.5 if bus_voltage >= 48 else 0.3
        project.add_netclass(
            "Power",
            clearance=power_clearance,
            track_width=1.5,
            via_diameter=1.2,
            via_drill=0.6
        )

    # High-current netclass (for phase outputs)
    project.add_netclass(
        "HighCurrent",
        clearance=0.3,
        track_width=2.0,
        via_diameter=1.5,
        via_drill=0.8
    )

    # Signal netclass (for low-power signals)
    project.add_netclass(
        "Signal",
        clearance=0.15,
        track_width=0.2,
        via_diameter=0.6,
        via_drill=0.3
    )

    # Add via size options
    project.add_via_size(0.6, 0.3)  # Small
    project.add_via_size(0.8, 0.4)  # Standard
    project.add_via_size(1.2, 0.6)  # Power
    project.add_via_size(1.5, 0.8)  # High current

    # Add track width options
    project.track_widths = [0.2, 0.25, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0]

    return project

