// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {BPJSRegistry} from "./BPJSRegistry.sol";

contract MedicalRecord {
    struct Record {
        uint256 recordId;
        bytes32 patientIdHash;
        address issuerFaskes;
        address doctorWallet;
        string encryptedPayloadCid;
        bytes32 encryptedPayloadHash;
        bytes32 recordTypeHash;
        uint256 previousRecordId;
        uint256 createdAt;
        bool active;
    }

    BPJSRegistry public immutable registry;

    error CallerNotFaskes();
    error PatientNotRegistered();
    error InactiveInsurance();
    error ZeroDoctorWallet();
    error EmptyEncryptedPayloadCid();
    error ZeroEncryptedPayloadHash();
    error ZeroRecordTypeHash();
    error PreviousRecordNotFound();
    error PreviousRecordPatientMismatch();
    error RecordNotFound();

    event RecordAdded(
        uint256 indexed recordId,
        bytes32 indexed patientIdHash,
        address indexed issuerFaskes,
        address doctorWallet
    );

    uint256 private _nextRecordId = 1;
    mapping(uint256 => Record) private _records;
    mapping(bytes32 => uint256[]) private _patientRecords;

    constructor(BPJSRegistry registry_) {
        registry = registry_;
    }

    function addRecord(
        bytes32 patientIdHash,
        address doctorWallet,
        string calldata encryptedPayloadCid,
        bytes32 encryptedPayloadHash,
        bytes32 recordTypeHash,
        uint256 previousRecordId
    ) external returns (uint256 recordId) {
        if (!registry.hasRole(registry.FASKES_ROLE(), msg.sender)) revert CallerNotFaskes();
        if (!registry.isRegisteredPatient(patientIdHash)) revert PatientNotRegistered();
        (bool active,) = registry.verifyInsurance(patientIdHash);
        if (!active) revert InactiveInsurance();
        if (doctorWallet == address(0)) revert ZeroDoctorWallet();
        if (bytes(encryptedPayloadCid).length == 0) revert EmptyEncryptedPayloadCid();
        if (encryptedPayloadHash == bytes32(0)) revert ZeroEncryptedPayloadHash();
        if (recordTypeHash == bytes32(0)) revert ZeroRecordTypeHash();

        if (previousRecordId != 0) {
            Record storage previousRecord = _records[previousRecordId];
            if (previousRecord.recordId == 0) revert PreviousRecordNotFound();
            if (previousRecord.patientIdHash != patientIdHash) revert PreviousRecordPatientMismatch();
        }

        recordId = _nextRecordId++;
        _records[recordId] = Record({
            recordId: recordId,
            patientIdHash: patientIdHash,
            issuerFaskes: msg.sender,
            doctorWallet: doctorWallet,
            encryptedPayloadCid: encryptedPayloadCid,
            encryptedPayloadHash: encryptedPayloadHash,
            recordTypeHash: recordTypeHash,
            previousRecordId: previousRecordId,
            createdAt: block.timestamp,
            active: true
        });
        _patientRecords[patientIdHash].push(recordId);

        emit RecordAdded(recordId, patientIdHash, msg.sender, doctorWallet);
    }

    function getPatientRecords(bytes32 patientIdHash) external view returns (uint256[] memory) {
        return _patientRecords[patientIdHash];
    }

    function getRecordMetadata(uint256 recordId) external view returns (Record memory) {
        Record memory record = _records[recordId];
        if (record.recordId == 0) revert RecordNotFound();
        return record;
    }

    function recordExists(uint256 recordId) external view returns (bool) {
        return _records[recordId].recordId != 0;
    }
}
