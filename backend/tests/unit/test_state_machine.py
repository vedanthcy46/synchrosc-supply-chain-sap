"""Unit tests for the workflow state machine and illegal transition validation."""
import pytest
from app.schemas.common import WorkflowState, IllegalStateTransitionError
from app.orchestration.state_machine import can_transition, validate_transition


def test_legal_forward_transitions():
    """Verify that expected linear happy-path transitions succeed."""
    assert can_transition(WorkflowState.DETECTED, WorkflowState.ANALYZING) is True
    assert can_transition(WorkflowState.ANALYZING, WorkflowState.OPTIONS_READY) is True
    assert can_transition(WorkflowState.OPTIONS_READY, WorkflowState.AWAITING_APPROVAL) is True
    assert can_transition(WorkflowState.AWAITING_APPROVAL, WorkflowState.READY_TO_EXECUTE) is True
    assert can_transition(WorkflowState.READY_TO_EXECUTE, WorkflowState.EXECUTING) is True
    assert can_transition(WorkflowState.EXECUTING, WorkflowState.VERIFYING) is True
    assert can_transition(WorkflowState.VERIFYING, WorkflowState.VERIFIED) is True


def test_illegal_jump_transitions_rejected():
    """Verify that attempting to skip policy or approval raises IllegalStateTransitionError."""
    with pytest.raises(IllegalStateTransitionError):
        validate_transition(WorkflowState.DETECTED, WorkflowState.EXECUTING)

    with pytest.raises(IllegalStateTransitionError):
        validate_transition(WorkflowState.DETECTED, WorkflowState.VERIFIED)

    with pytest.raises(IllegalStateTransitionError):
        validate_transition(WorkflowState.OPTIONS_READY, WorkflowState.EXECUTING)


def test_terminal_states_prevent_execution():
    """Verify that VERIFIED and CLOSED states cannot transition back to EXECUTING."""
    with pytest.raises(IllegalStateTransitionError):
        validate_transition(WorkflowState.VERIFIED, WorkflowState.EXECUTING)

    with pytest.raises(IllegalStateTransitionError):
        validate_transition(WorkflowState.CLOSED, WorkflowState.EXECUTING)


def test_recoverable_failed_state():
    """Verify that FAILED state allows re-analyzing retry."""
    assert can_transition(WorkflowState.FAILED, WorkflowState.ANALYZING) is True
    with pytest.raises(IllegalStateTransitionError):
        validate_transition(WorkflowState.FAILED, WorkflowState.VERIFIED)
