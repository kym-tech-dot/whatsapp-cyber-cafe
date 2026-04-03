// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  phoneNumber   String   @unique
  name          String?
  createdAt     DateTime @default(now())
  lastActive    DateTime @updatedAt
  tasks         Task[]
}

model Task {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  serviceType   String   // e.g., "kra_nil"
  status        String   // "QUEUED", "IN_PROGRESS", "SUCCESS", "FAILED"
  resultUrl     String?  // URL to downloaded receipt/document
  errorMessage  String?
  startedAt     DateTime @default(now())
  completedAt   DateTime?
}
