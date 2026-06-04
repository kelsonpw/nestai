-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HEAD', 'DEPENDENT', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "AvailabilityState" AS ENUM ('AVAILABLE', 'BUSY', 'TRAVEL');

-- CreateEnum
CREATE TYPE "TaskUrgency" AS ENUM ('LOW', 'MED', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'ASSIGNED', 'CLAIMED', 'DROPPED', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('MAINTENANCE', 'SCHOOL', 'ERRAND', 'ADMIN', 'EVENT', 'SEASONAL', 'WELLNESS', 'LOGISTICS');

-- CreateEnum
CREATE TYPE "IngestionKind" AS ENUM ('CALENDAR', 'WHATSAPP', 'EMAIL', 'UPLOAD', 'SCREENSHOT');

-- CreateEnum
CREATE TYPE "ApprovalReason" AS ENUM ('PERMISSION_SLIP', 'FEE', 'QUOTE', 'ASSIGNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DAILY_DIGEST', 'JIT_REMINDER', 'APPROVAL_REQUEST', 'ESCALATION_BROADCAST', 'CRITICAL_OVERRIDE', 'SUNDAY_CHECKIN', 'MILESTONE', 'WELLNESS_SUGGESTION', 'CLAIM_WINDOW');

-- CreateEnum
CREATE TYPE "SeasonalKind" AS ENUM ('CAMP', 'SPORTS', 'CAMPSITE', 'SKI_TRIP', 'TRIP');

-- CreateEnum
CREATE TYPE "SeasonalStatus" AS ENUM ('SEARCHING', 'TRACKING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "MilestoneStage" AS ENUM ('PREP_30D', 'ASSET_CHECK_14D', 'FINAL_48H', 'JIT_15M');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('VEHICLE', 'GEAR');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('NL_TEXT', 'SUNDAY_CHECKIN', 'SCREENSHOT_OCR');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('SOLE_DRIVER', 'RIPPLE_SHIFT', 'BUFFER_SQUEEZE');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "WellnessKind" AS ENUM ('GYM', 'QUIET', 'DATE_NIGHT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WellnessPeriod" AS ENUM ('WEEKLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "WellnessWindowStatus" AS ENUM ('SUGGESTED', 'CLAIMED', 'SLID', 'MISSED');

-- CreateEnum
CREATE TYPE "PiiTokenType" AS ENUM ('ADDRESS', 'SSN', 'PHONE', 'EMAIL', 'FINANCIAL', 'CORP_LOGO', 'NAME');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IngestionSourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "digestTimeLocal" TEXT NOT NULL,
    "sundayCheckinTimeLocal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "birthDate" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "drivingPrivileges" BOOLEAN NOT NULL DEFAULT false,
    "homeLocation" JSONB,
    "officeLocation" JSONB,
    "commuteMinutes" INTEGER,
    "availabilityState" "AvailabilityState" NOT NULL DEFAULT 'AVAILABLE',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "messagingHandle" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionSource" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "IngestionKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalRef" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "status" "IngestionSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMessage" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "sourceId" TEXT,
    "rawText" TEXT NOT NULL,
    "scrubbedText" TEXT,
    "tokenMap" JSONB,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" JSONB,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT,
    "ownerMemberId" TEXT,
    "colorTag" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "urgency" "TaskUrgency" NOT NULL DEFAULT 'MED',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "category" "TaskCategory" NOT NULL,
    "assignedMemberId" TEXT,
    "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "recurrenceRule" TEXT,
    "parentTaskId" TEXT,
    "sourceMessageId" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" "ApprovalReason" NOT NULL,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchCategory" "TaskCategory",
    "matchSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "assignToMemberId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyContext" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "refId" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalProject" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "SeasonalKind" NOT NULL,
    "status" "SeasonalStatus" NOT NULL DEFAULT 'SEARCHING',
    "title" TEXT NOT NULL,
    "targetWindow" JSONB,
    "sourceMessageId" TEXT,
    "location" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationTimeline" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "SeasonalKind" NOT NULL,
    "region" TEXT,
    "label" TEXT NOT NULL,
    "opensRule" TEXT NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "seasonalProjectId" TEXT NOT NULL,
    "stage" "MilestoneStage" NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "fired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdAsset" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "name" TEXT NOT NULL,
    "attrs" JSONB NOT NULL DEFAULT '{}',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnAssetId" TEXT,
    "dependsOnChildId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "broadcastAt" TIMESTAMP(3),
    "claimedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimToken" (
    "token" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "escalationEventId" TEXT,
    "memberId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "AvailabilityState" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "source" "AvailabilitySource" NOT NULL,
    "purgeRawAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "ConflictType" NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "mitigation" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "relatedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessGoal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "WellnessKind" NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "period" "WellnessPeriod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessWindow" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "goalId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "WellnessWindowStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_householdId_idx" ON "Member"("householdId");

-- CreateIndex
CREATE INDEX "IngestionSource_householdId_idx" ON "IngestionSource"("householdId");

-- CreateIndex
CREATE INDEX "RawMessage_householdId_idx" ON "RawMessage"("householdId");

-- CreateIndex
CREATE INDEX "RawMessage_sourceId_idx" ON "RawMessage"("sourceId");

-- CreateIndex
CREATE INDEX "Event_householdId_idx" ON "Event"("householdId");

-- CreateIndex
CREATE INDEX "Event_sourceId_idx" ON "Event"("sourceId");

-- CreateIndex
CREATE INDEX "Event_ownerMemberId_idx" ON "Event"("ownerMemberId");

-- CreateIndex
CREATE INDEX "Task_householdId_idx" ON "Task"("householdId");

-- CreateIndex
CREATE INDEX "Task_assignedMemberId_idx" ON "Task"("assignedMemberId");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "Approval_householdId_idx" ON "Approval"("householdId");

-- CreateIndex
CREATE INDEX "Approval_taskId_idx" ON "Approval"("taskId");

-- CreateIndex
CREATE INDEX "Notification_householdId_idx" ON "Notification"("householdId");

-- CreateIndex
CREATE INDEX "Notification_memberId_idx" ON "Notification"("memberId");

-- CreateIndex
CREATE INDEX "RoutingRule_householdId_idx" ON "RoutingRule"("householdId");

-- CreateIndex
CREATE INDEX "FamilyContext_householdId_idx" ON "FamilyContext"("householdId");

-- CreateIndex
CREATE INDEX "SeasonalProject_householdId_idx" ON "SeasonalProject"("householdId");

-- CreateIndex
CREATE INDEX "RegistrationTimeline_householdId_idx" ON "RegistrationTimeline"("householdId");

-- CreateIndex
CREATE INDEX "Milestone_householdId_idx" ON "Milestone"("householdId");

-- CreateIndex
CREATE INDEX "Milestone_seasonalProjectId_idx" ON "Milestone"("seasonalProjectId");

-- CreateIndex
CREATE INDEX "HouseholdAsset_householdId_idx" ON "HouseholdAsset"("householdId");

-- CreateIndex
CREATE INDEX "TaskDependency_householdId_idx" ON "TaskDependency"("householdId");

-- CreateIndex
CREATE INDEX "TaskDependency_taskId_idx" ON "TaskDependency"("taskId");

-- CreateIndex
CREATE INDEX "EscalationEvent_householdId_idx" ON "EscalationEvent"("householdId");

-- CreateIndex
CREATE INDEX "EscalationEvent_taskId_idx" ON "EscalationEvent"("taskId");

-- CreateIndex
CREATE INDEX "ClaimToken_taskId_idx" ON "ClaimToken"("taskId");

-- CreateIndex
CREATE INDEX "ClaimToken_escalationEventId_idx" ON "ClaimToken"("escalationEventId");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_householdId_idx" ON "AvailabilityBlock"("householdId");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_memberId_idx" ON "AvailabilityBlock"("memberId");

-- CreateIndex
CREATE INDEX "Conflict_householdId_idx" ON "Conflict"("householdId");

-- CreateIndex
CREATE INDEX "Conflict_relatedTaskId_idx" ON "Conflict"("relatedTaskId");

-- CreateIndex
CREATE INDEX "WellnessGoal_householdId_idx" ON "WellnessGoal"("householdId");

-- CreateIndex
CREATE INDEX "WellnessGoal_memberId_idx" ON "WellnessGoal"("memberId");

-- CreateIndex
CREATE INDEX "WellnessWindow_householdId_idx" ON "WellnessWindow"("householdId");

-- CreateIndex
CREATE INDEX "WellnessWindow_memberId_idx" ON "WellnessWindow"("memberId");

-- CreateIndex
CREATE INDEX "WellnessWindow_goalId_idx" ON "WellnessWindow"("goalId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionSource" ADD CONSTRAINT "IngestionSource_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_assignToMemberId_fkey" FOREIGN KEY ("assignToMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyContext" ADD CONSTRAINT "FamilyContext_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonalProject" ADD CONSTRAINT "SeasonalProject_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationTimeline" ADD CONSTRAINT "RegistrationTimeline_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_seasonalProjectId_fkey" FOREIGN KEY ("seasonalProjectId") REFERENCES "SeasonalProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdAsset" ADD CONSTRAINT "HouseholdAsset_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnAssetId_fkey" FOREIGN KEY ("dependsOnAssetId") REFERENCES "HouseholdAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnChildId_fkey" FOREIGN KEY ("dependsOnChildId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimToken" ADD CONSTRAINT "ClaimToken_escalationEventId_fkey" FOREIGN KEY ("escalationEventId") REFERENCES "EscalationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessGoal" ADD CONSTRAINT "WellnessGoal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessGoal" ADD CONSTRAINT "WellnessGoal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessWindow" ADD CONSTRAINT "WellnessWindow_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessWindow" ADD CONSTRAINT "WellnessWindow_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessWindow" ADD CONSTRAINT "WellnessWindow_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "WellnessGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

