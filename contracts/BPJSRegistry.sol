// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract BPJSRegistry is AccessControl {
    bytes32 public constant ADMIN_BPJS_ROLE = keccak256("ADMIN_BPJS_ROLE");
    bytes32 public constant FASKES_ROLE = keccak256("FASKES_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    struct Patient {
        address wallet;
        bool active;
        uint8 serviceClass;
        bytes encryptionPublicKey;
        bool exists;
    }

    struct Faskes {
        bytes32 facilityIdHash;
        bytes encryptionPublicKey;
        bool exists;
    }

    error ZeroPatientIdHash();
    error ZeroWallet();
    error ZeroFacilityIdHash();
    error EmptyEncryptionPublicKey();
    error InvalidServiceClass();
    error PatientAlreadyRegistered();
    error PatientWalletAlreadyRegistered();
    error PatientNotRegistered();
    error FaskesAlreadyRegistered();
    error FacilityAlreadyRegistered();
    error AuditorAlreadyRegistered();
    error CallerNotRegistered();

    event PatientRegistered(bytes32 indexed patientIdHash, address indexed patientWallet, uint8 serviceClass);
    event InsuranceStatusUpdated(bytes32 indexed patientIdHash, bool active, uint8 serviceClass);
    event FaskesRegistered(address indexed faskesWallet, bytes32 indexed facilityIdHash);
    event AuditorRegistered(address indexed auditorWallet);
    event EncryptionPublicKeyUpdated(address indexed wallet);

    mapping(bytes32 => Patient) private _patients;
    mapping(address => bytes32) private _patientIdByWallet;
    mapping(address => Faskes) private _faskes;
    mapping(bytes32 => bool) private _facilityRegistered;
    mapping(address => bytes) private _auditorKeys;
    mapping(address => bytes) private _adminKeys;

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroWallet();
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_BPJS_ROLE, initialAdmin);
    }

    function registerPatient(
        bytes32 patientIdHash,
        address patientWallet,
        uint8 serviceClass,
        bytes calldata encryptionPublicKey
    ) external onlyRole(ADMIN_BPJS_ROLE) {
        _validatePatientId(patientIdHash);
        _validateWallet(patientWallet);
        _validateServiceClass(serviceClass);
        _validateKey(encryptionPublicKey);
        if (_patients[patientIdHash].exists) revert PatientAlreadyRegistered();
        if (_patientIdByWallet[patientWallet] != bytes32(0)) revert PatientWalletAlreadyRegistered();

        _patients[patientIdHash] = Patient({
            wallet: patientWallet,
            active: true,
            serviceClass: serviceClass,
            encryptionPublicKey: encryptionPublicKey,
            exists: true
        });
        _patientIdByWallet[patientWallet] = patientIdHash;

        emit PatientRegistered(patientIdHash, patientWallet, serviceClass);
    }

    function updateInsuranceStatus(
        bytes32 patientIdHash,
        bool active,
        uint8 serviceClass
    ) external onlyRole(ADMIN_BPJS_ROLE) {
        _validateServiceClass(serviceClass);
        Patient storage patient = _patients[patientIdHash];
        if (!patient.exists) revert PatientNotRegistered();

        patient.active = active;
        patient.serviceClass = serviceClass;

        emit InsuranceStatusUpdated(patientIdHash, active, serviceClass);
    }

    function registerFaskes(
        address faskesWallet,
        bytes32 facilityIdHash,
        bytes calldata encryptionPublicKey
    ) external onlyRole(ADMIN_BPJS_ROLE) {
        _validateWallet(faskesWallet);
        if (facilityIdHash == bytes32(0)) revert ZeroFacilityIdHash();
        _validateKey(encryptionPublicKey);
        if (_faskes[faskesWallet].exists) revert FaskesAlreadyRegistered();
        if (_facilityRegistered[facilityIdHash]) revert FacilityAlreadyRegistered();

        _faskes[faskesWallet] = Faskes({
            facilityIdHash: facilityIdHash,
            encryptionPublicKey: encryptionPublicKey,
            exists: true
        });
        _facilityRegistered[facilityIdHash] = true;
        _grantRole(FASKES_ROLE, faskesWallet);

        emit FaskesRegistered(faskesWallet, facilityIdHash);
    }

    function registerAuditor(
        address auditorWallet,
        bytes calldata encryptionPublicKey
    ) external onlyRole(ADMIN_BPJS_ROLE) {
        _validateWallet(auditorWallet);
        _validateKey(encryptionPublicKey);
        if (hasRole(AUDITOR_ROLE, auditorWallet)) revert AuditorAlreadyRegistered();

        _auditorKeys[auditorWallet] = encryptionPublicKey;
        _grantRole(AUDITOR_ROLE, auditorWallet);

        emit AuditorRegistered(auditorWallet);
    }

    function updateMyEncryptionPublicKey(bytes calldata encryptionPublicKey) external {
        _validateKey(encryptionPublicKey);

        bytes32 patientIdHash = _patientIdByWallet[msg.sender];
        if (patientIdHash != bytes32(0)) {
            _patients[patientIdHash].encryptionPublicKey = encryptionPublicKey;
            emit EncryptionPublicKeyUpdated(msg.sender);
            return;
        }

        if (_faskes[msg.sender].exists) {
            _faskes[msg.sender].encryptionPublicKey = encryptionPublicKey;
            emit EncryptionPublicKeyUpdated(msg.sender);
            return;
        }

        if (hasRole(AUDITOR_ROLE, msg.sender)) {
            _auditorKeys[msg.sender] = encryptionPublicKey;
            emit EncryptionPublicKeyUpdated(msg.sender);
            return;
        }

        if (hasRole(ADMIN_BPJS_ROLE, msg.sender)) {
            _adminKeys[msg.sender] = encryptionPublicKey;
            emit EncryptionPublicKeyUpdated(msg.sender);
            return;
        }

        revert CallerNotRegistered();
    }

    function verifyInsurance(bytes32 patientIdHash) external view returns (bool active, uint8 serviceClass) {
        Patient storage patient = _patients[patientIdHash];
        if (!patient.exists) {
            return (false, 0);
        }
        return (patient.active, patient.serviceClass);
    }

    function isRegisteredPatient(bytes32 patientIdHash) external view returns (bool) {
        return _patients[patientIdHash].exists;
    }

    function patientWalletOf(bytes32 patientIdHash) external view returns (address) {
        return _patients[patientIdHash].wallet;
    }

    function patientIdOfWallet(address wallet) external view returns (bytes32) {
        return _patientIdByWallet[wallet];
    }

    function encryptionPublicKeyOf(address wallet) external view returns (bytes memory) {
        bytes32 patientIdHash = _patientIdByWallet[wallet];
        if (patientIdHash != bytes32(0)) {
            return _patients[patientIdHash].encryptionPublicKey;
        }
        if (_faskes[wallet].exists) {
            return _faskes[wallet].encryptionPublicKey;
        }
        if (hasRole(AUDITOR_ROLE, wallet)) {
            return _auditorKeys[wallet];
        }
        return _adminKeys[wallet];
    }

    function _validatePatientId(bytes32 patientIdHash) private pure {
        if (patientIdHash == bytes32(0)) revert ZeroPatientIdHash();
    }

    function _validateWallet(address wallet) private pure {
        if (wallet == address(0)) revert ZeroWallet();
    }

    function _validateKey(bytes calldata encryptionPublicKey) private pure {
        if (encryptionPublicKey.length == 0) revert EmptyEncryptionPublicKey();
    }

    function _validateServiceClass(uint8 serviceClass) private pure {
        if (serviceClass < 1 || serviceClass > 3) revert InvalidServiceClass();
    }
}
