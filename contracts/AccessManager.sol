// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {BPJSRegistry} from "./BPJSRegistry.sol";
import {MedicalRecord} from "./MedicalRecord.sol";

contract AccessManager {
    enum AccessStatus {
        Pending,
        PatientApproved,
        DoctorApproved,
        Granted,
        Rejected,
        Revoked,
        Expired
    }

    struct AccessRequest {
        uint256 requestId;
        uint256 recordId;
        address requester;
        address patientWallet;
        address issuerFaskes;
        uint64 expiresAt;
        bool patientApproved;
        bool doctorApproved;
        bytes encryptedDekForRequester;
        AccessStatus status;
    }

    BPJSRegistry public immutable registry;
    MedicalRecord public immutable medicalRecord;

    error RecordNotFound();
    error InvalidExpiry();
    error RequestNotFound();
    error CallerNotPatient();
    error CallerNotIssuerFaskes();
    error CallerCannotManageAccess();
    error CallerCannotSubmitKey();
    error RequestTerminal();
    error RequestExpired();
    error ApprovalsIncomplete();
    error EmptyEncryptedDek();

    event AccessRequested(uint256 indexed requestId, uint256 indexed recordId, address indexed requester, uint64 expiresAt);
    event PatientApproved(uint256 indexed requestId, address indexed patientWallet);
    event DoctorApproved(uint256 indexed requestId, address indexed issuerFaskes);
    event AccessRejected(uint256 indexed requestId, address indexed rejectedBy);
    event AccessGranted(uint256 indexed requestId, address indexed requester);
    event AccessRevoked(uint256 indexed requestId, address indexed revokedBy);

    uint256 private _nextRequestId = 1;
    mapping(uint256 => AccessRequest) private _requests;

    constructor(BPJSRegistry registry_, MedicalRecord medicalRecord_) {
        registry = registry_;
        medicalRecord = medicalRecord_;
    }

    function requestAccess(uint256 recordId, uint64 expiresAt) external returns (uint256 requestId) {
        if (!medicalRecord.recordExists(recordId)) revert RecordNotFound();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        MedicalRecord.Record memory record = medicalRecord.getRecordMetadata(recordId);
        address patientWallet = registry.patientWalletOf(record.patientIdHash);

        requestId = _nextRequestId++;
        _requests[requestId] = AccessRequest({
            requestId: requestId,
            recordId: recordId,
            requester: msg.sender,
            patientWallet: patientWallet,
            issuerFaskes: record.issuerFaskes,
            expiresAt: expiresAt,
            patientApproved: false,
            doctorApproved: false,
            encryptedDekForRequester: "",
            status: AccessStatus.Pending
        });

        emit AccessRequested(requestId, recordId, msg.sender, expiresAt);
    }

    function approveByPatient(uint256 requestId) external {
        AccessRequest storage request = _loadActiveRequest(requestId);
        if (msg.sender != request.patientWallet) revert CallerNotPatient();

        request.patientApproved = true;
        request.status = AccessStatus.PatientApproved;

        emit PatientApproved(requestId, msg.sender);
    }

    function approveByDoctor(uint256 requestId) external {
        AccessRequest storage request = _loadActiveRequest(requestId);
        if (msg.sender != request.issuerFaskes) revert CallerNotIssuerFaskes();

        request.doctorApproved = true;
        request.status = AccessStatus.DoctorApproved;

        emit DoctorApproved(requestId, msg.sender);
    }

    function rejectByPatient(uint256 requestId) external {
        AccessRequest storage request = _loadActiveRequest(requestId);
        if (msg.sender != request.patientWallet) revert CallerNotPatient();

        request.status = AccessStatus.Rejected;

        emit AccessRejected(requestId, msg.sender);
    }

    function rejectByDoctor(uint256 requestId) external {
        AccessRequest storage request = _loadActiveRequest(requestId);
        if (msg.sender != request.issuerFaskes) revert CallerNotIssuerFaskes();

        request.status = AccessStatus.Rejected;

        emit AccessRejected(requestId, msg.sender);
    }

    function submitAccessKey(uint256 requestId, bytes calldata encryptedDekForRequester) external {
        AccessRequest storage request = _loadExistingRequest(requestId);
        _revertIfTerminal(request.status);
        if (block.timestamp > request.expiresAt) revert RequestExpired();
        if (msg.sender != request.patientWallet && msg.sender != request.issuerFaskes) revert CallerCannotSubmitKey();
        if (encryptedDekForRequester.length == 0) revert EmptyEncryptedDek();
        if (!request.patientApproved || !request.doctorApproved) revert ApprovalsIncomplete();

        request.encryptedDekForRequester = encryptedDekForRequester;
        request.status = AccessStatus.Granted;

        emit AccessGranted(requestId, request.requester);
    }

    function revokeAccess(uint256 requestId) external {
        AccessRequest storage request = _loadExistingRequest(requestId);
        if (request.status == AccessStatus.Rejected || request.status == AccessStatus.Revoked) revert RequestTerminal();
        if (block.timestamp > request.expiresAt && request.status != AccessStatus.Granted) revert RequestExpired();
        if (msg.sender != request.patientWallet && msg.sender != request.issuerFaskes) revert CallerCannotManageAccess();

        request.status = AccessStatus.Revoked;

        emit AccessRevoked(requestId, msg.sender);
    }

    function getAccessStatus(uint256 requestId) public view returns (AccessStatus) {
        AccessRequest storage request = _requests[requestId];
        if (request.requestId == 0) revert RequestNotFound();
        if (
            block.timestamp > request.expiresAt &&
            request.status != AccessStatus.Rejected &&
            request.status != AccessStatus.Revoked
        ) {
            return AccessStatus.Expired;
        }
        return request.status;
    }

    function getEncryptedAccessKey(uint256 requestId) external view returns (bytes memory) {
        AccessRequest storage request = _requests[requestId];
        if (request.requestId == 0) revert RequestNotFound();
        return request.encryptedDekForRequester;
    }

    function _loadActiveRequest(uint256 requestId) private view returns (AccessRequest storage request) {
        request = _loadExistingRequest(requestId);
        _revertIfTerminal(request.status);
        if (block.timestamp > request.expiresAt) revert RequestExpired();
    }

    function _loadExistingRequest(uint256 requestId) private view returns (AccessRequest storage request) {
        request = _requests[requestId];
        if (request.requestId == 0) revert RequestNotFound();
    }

    function _revertIfTerminal(AccessStatus status) private pure {
        if (
            status == AccessStatus.Granted ||
            status == AccessStatus.Rejected ||
            status == AccessStatus.Revoked
        ) {
            revert RequestTerminal();
        }
    }
}
