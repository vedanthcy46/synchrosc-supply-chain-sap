"""State machine governing legal workflow status transitions."""
from typing import Dict, Set, Union
from app.schemas.common import WorkflowState, IllegalStateTransitionError

# Exact transition graph defined in docs/02-workflow-and-state-machine.md
LEGAL_TRANSITIONS: Dict[WorkflowState, Set[WorkflowState]] = {
    WorkflowState.DETECTED: {WorkflowState.ANALYZING, WorkflowState.FAILED},
    WorkflowState.ANALYZING: {WorkflowState.OPTIONS_READY, WorkflowState.FAILED},
    WorkflowState.OPTIONS_READY: {
        WorkflowState.AWAITING_APPROVAL,
        WorkflowState.READY_TO_EXECUTE,
        WorkflowState.CLOSED,
    },
    WorkflowState.AWAITING_APPROVAL: {
        WorkflowState.READY_TO_EXECUTE,
        WorkflowState.OPTIONS_READY,
        WorkflowState.CLOSED,
    },
    WorkflowState.READY_TO_EXECUTE: {WorkflowState.EXECUTING},
    WorkflowState.EXECUTING: {WorkflowState.VERIFYING, WorkflowState.FAILED},
    WorkflowState.VERIFYING: {WorkflowState.VERIFIED, WorkflowState.FAILED},
    WorkflowState.VERIFIED: set(),  # terminal
    WorkflowState.CLOSED: set(),    # terminal
    WorkflowState.FAILED: {WorkflowState.ANALYZING},  # retry
}


def can_transition(
    current_state: Union[str, WorkflowState],
    target_state: Union[str, WorkflowState],
) -> bool:
    """Check whether a transition between two states is permitted."""
    current = WorkflowState(current_state) if isinstance(current_state, str) else current_state
    target = WorkflowState(target_state) if isinstance(target_state, str) else target_state

    permitted = LEGAL_TRANSITIONS.get(current, set())
    return target in permitted


def validate_transition(
    current_state: Union[str, WorkflowState],
    target_state: Union[str, WorkflowState],
    reason: str = "",
) -> WorkflowState:
    """Validate a transition, raising IllegalStateTransitionError if illegal."""
    try:
        current = WorkflowState(current_state) if isinstance(current_state, str) else current_state
        target = WorkflowState(target_state) if isinstance(target_state, str) else target_state
    except ValueError as exc:
        raise IllegalStateTransitionError(str(current_state), str(target_state), str(exc))

    if not can_transition(current, target):
        raise IllegalStateTransitionError(current.value, target.value, reason)

    return target
