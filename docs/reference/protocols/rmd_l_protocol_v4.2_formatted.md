# RMD-L Motor Motion Protocol V4.2 (extracted)

Source: Motor Motion Protocol V4.2-250208.pdf

Servo Motor Control Protocol

       Applicable driver: V3
          Version: V4.2
          Date: 2024.05

Disclaimer
Thanks for choosing MYACTUATOR. Please read this statement carefully before
using. Once used,this statement is deemed to be approved and accepted.Please install
and use this product strictly in accordance with the manual,product description and
relevant laws,regulations,policies and guidelines. In the process of using the product,the
user undertakes to be responsible for his own behavior and all consequences arising
therefrom. MYACTUATOR will not be liable for any loss caused by improper
use,installation and modification of the user.
MYACTUATOR is the trademark of Suzhou Micro Actuator Technology Co.,Ltd.
and its affiliates. Product names,brands,etc. appearing in this document are trademarks
or registered trademarks of their respective companies.
This product and manual are copyrighted by MYACTUATOR. Reproduction in
any form is not permitted without permission. The final interpretation right of the
disclaimer belongs to MYACTUATOR.

                                             I

## Catalog

- 1.  Communication Bus Parameters and Message Format
  - 1.1. CAN Bus
    - 1.1.1. Parameters
    - 1.1.2. Message Format
  - 1.2. RS485 Bus
    - 1.2.1. Parameters
    - 1.2.2. Message Format
- 2.  Single Motor Command Description
  - 2.1. Read PID Parameter Command (0x30)
    - 2.1.1. Instruction Description
    - 2.1.2. Send Data Field Definition
    - 2.1.3. Reply Data Field Definition
    - 2.1.4. Function Index Description
    - 2.1.5. Communication Example
  - 2.2. Write PID Parameters to RAM Command (0x31)
    - 2.2.1. Instruction Description
    - 2.2.2. Send Data Field Definition
    - 2.2.3. Reply Data Field Definition
    - 2.2.4. Function Index Description
    - 2.2.5. Communication Example
  - 2.3. Write PID Parameters to ROM Command (0x32)
    - 2.3.1. Instruction Description
    - 2.3.2. Send Data Field Definition
    - 2.3.3. Reply Data Field Definition
    - 2.3.4. Function Index Description
    - 2.3.5. Communication Example
  - 2.4. Read Acceleration Command (0x42)
    - 2.4.1. Instruction Description
    - 2.4.2. Send Data Field Definition
    - 2.4.3. Reply Data Field Definition
    - 2.4.4. Function Index Description
    - 2.4.5. Communication Example
  - 2.5. Write Acceleration to RAM and ROM Command (0x43)
    - 2.5.1. Instruction Description
    - 2.5.2. Send Data Field Definition
    - 2.5.3. Reply Data Field Definition
    - 2.5.4. Function Index Description
    - 2.5.5. Communication Example
  - 2.6. Read Multi-Turn Encoder Position Data Command (0x60)
    - 2.6.1. Instruction Description
    - 2.6.2. Send Data Field Definition
    - 2.6.3. Reply Data Field Definition
    - 2.6.4. Communication Example
  - 2.7. Read Multi-Turn Encoder Original Position Data Command (0x61)
    - 2.7.1. Instruction Description
    - 2.7.2. Send Data Field Definition
    - 2.7.3. Reply Data Field Definition
    - 2.7.4. Communication Example
  - 2.8. Read Multi-Turn Encoder Zero Offset Data Command (0x62)
    - 2.8.1. Instruction Description
    - 2.8.2. Send Data Field Definition
    - 2.8.3. Reply Data Field Definition
    - 2.8.4. Communication Example
  - 2.9. Write Encoder Multi-Turn Value to ROM as Motor Zero Command (0x63)
    - 2.9.1. Instruction Description
    - 2.9.2. Send Data Field Definition
    - 2.9.3. Reply Data Field Definition
    - 2.9.4. Communication Example
  - 2.10. Write the Current Multi-Turn Position of the Encoder to the ROM as the Motor Zero Command (0x64)
    - 2.10.1. Instruction Description
    - 2.10.2. Send Data Field Definition
    - 2.10.3. Reply Data Field Definition
    - 2.10.4. Communication Example
  - 2.11. Read Single-Turn Encoder Command (0x90)
    - 2.11.1. Instruction Description
    - 2.11.2. Send Data Field Definition
    - 2.11.3. Reply Data Field Definition
    - 2.11.4. Communication Example
  - 2.12. Read Multi-Turn Angle Command (0x92)
    - 2.12.1. Instruction Description
    - 2.12.2. Send Data Field Definition
    - 2.12.3. Reply Data Field Definition
    - 2.12.4. Communication Example
  - 2.13. Read Single-Turn Angle Command (0x94)
    - 2.13.1. Instruction Description
    - 2.13.2. Send Data Field Definition
    - 2.13.3. Reply Data Field Definition
    - 2.13.4. Communication Example
  - 2.14. Read Motor Status 1 and Error Flag Command (0x9A)
    - 2.14.1. Instruction Description
    - 2.14.2. Send Data Field Definition
    - 2.14.3. Reply Data Field Definition
    - 2.14.4. Communication Example
  - 2.15. Read Motor Status 2 Command (0x9C)
    - 2.15.1. Instruction Description
    - 2.15.2. Send Data Field Definition
    - 2.15.3. Reply Data Field Definition
    - 2.15.4. Communication Example
  - 2.16. Read Motor Status 3 Command (0x9D)
    - 2.16.1. Instruction Description
    - 2.16.2. Send Data Field Definition
    - 2.16.3. Reply Data Field Definition
    - 2.16.4. Communication Example
  - 2.17. Motor Shutdown Command (0x80)
    - 2.17.1. Instruction Description
    - 2.17.2. Send Data Field Definition
    - 2.17.3. Reply Data Field Definition
  - 2.18. Motor Stop Command (0x81)
    - 2.18.1. Instruction Description
    - 2.18.2. Send Data Field Definition
    - 2.18.3. Reply Data Field Definition
  - 2.19. Torque Closed-Loop Control Command (0xA1)
    - 2.19.1. Instruction Description
    - 2.19.2. Send Data Field Definition
    - 2.19.3. Reply Data Field Definition
    - 2.19.4. Communication Example
  - 2.20. Speed Closed-Loop Control Command (0xA2)
    - 2.20.1. Instruction Description
    - 2.20.2. Send Data Field Definition
    - 2.20.3. Reply Data Field Definition
    - 2.20.4. Communication Example
  - 2.21. Absolute Position Closed-Loop Control Command (0xA4)
    - 2.21.1. Instruction Description
    - 2.21.2. Send Data Field Definition
    - 2.21.3. Reply Data Field Definition
    - 2.21.4. Communication Example
  - 2.22. Single-Turn Position Control Command (0xA6)
    - 2.22.1. Instruction Description
    - 2.22.2. Send Data Field Definition
    - 2.22.3. Reply Data Field Definition
    - 2.22.4. Communication Example
  - 2.23. Incremental Position Closed-Loop Control Command (0xA8)
    - 2.23.1. Instruction Description
    - 2.23.2. Send Data Field Definition
    - 2.23.3. Reply Data Field Definition
    - 2.23.4. Communication Example
  - 2.24. System Operating Mode Acquisition (0x70)
    - 2.24.1. Instruction Description
    - 2.24.2. Send Data Field Definition
    - 2.24.3. Reply Data Field Definition
    - 2.24.4. Communication Example
  - 2.25. System Reset Command (0x76)
    - 2.25.1. Instruction Description
    - 2.25.2. Send Data Field Definition
    - 2.25.3. Reply Data Field Definition
    - 2.25.4. Communication Example
  - 2.26. System Brake Release Command (0x77)
    - 2.26.1. Instruction Description
    - 2.26.2. Send Data Field Definition
    - 2.26.3. Reply Data Field Definition
  - 2.27. System Brake Lock Command (0x78)
    - 2.27.1. Instruction Description
    - 2.27.2. Send Data Field Definition
    - 2.27.3. Reply Data Field Definition
  - 2.28. System Runtime Read Command (0xB1)
    - 2.28.1. Instruction Description
    - 2.28.2. Send Data Field Definition
    - 2.28.3. Reply Data Field Definition
    - 2.28.4. Communication Example
  - 2.29. System Software Version Date Read Command (0xB2)
    - 2.29.1. Instruction Description
    - 2.29.2. Send Data Field Definition
    - 2.29.3. Reply Data Field Definition
    - 2.29.4. Communication Example
  - 2.30. Communication Interruption Protection Time Setting Command (0xB3)
    - 2.30.1. Instruction Description
    - 2.30.2. Send Data Field Definition
    - 2.30.3. Reply Data Field Definition
    - 2.30.4. Communication Example
  - 2.31. Communication Baud Rate Setting Command (0xB4)
    - 2.31.1. Instruction Description
    - 2.31.2. Send Data Field Definition
    - 2.31.3. Reply Data Field Definition
    - 2.31.4. Communication Example
  - 2.32. Motor Model Reading Command (0xB5)
    - 2.32.1. Instruction Description
    - 2.32.2. Send Data Field Definition
    - 2.32.3. Reply Data Field Definition
    - 2.32.4. Communication Example
  - 2.33. Active Reply Function Command (0xB6)
    - 2.33.1. Instruction Description
    - 2.33.2. Send Data Field Definition
    - 2.33.3. Reply Data Field Definition
    - 2.33.4. Example of Communication
  - 2.34. Function Control Command (0x20)
    - 2.34.1. Instruction Description
    - 2.34.2. Send Data Field Definition
    - 2.34.3. Reply Data Field Definition
    - 2.34.4. Function Index Description
    - 2.34.5. Communication Example
- 3.  CAN Multi-Motor Command (0x280 + Command)
  - 3.1. Instruction Description
  - 3.2. Communication Example
- 4.  CANID Setting Command (0x79)
  - 4.1. Instruction Description
  - 4.2. Send Data Field Definition
  - 4.3. Reply Data Field Definition
  - 4.4. Communication Example
- 5.  Motion Mode Control Command_CAN (0x400 + ID)
  - 5.1. Instruction Description
  - 5.2. Send Data Field Definition
  - 5.3. Reply Data Field Definition
  - 5.4. Communication Example
- 6.  RS485 Multi-Motor Command (0xCD + Command)
  - 6.1. Instruction Description
  - 6.2. Communication Example
- 7.  RS485-ID Setting Command (0x79)
  - 7.1. Instruction Description
  - 7.2. Send Data Field Definition
  - 7.3. Reply Data Field Definition
  - 7.4. Communication Example
- 8.  Indicator Light Description
  - 8.1. Status Description
  - 8.2. Failure Description Form
- 9.  Version Revision Information

## 1. Communication Bus Parameters and Message Format

### 1.1. CAN Bus

#### 1.1.1. Parameters

Bus interface: CAN
Baud rate: 1Mbps

#### 1.1.2. Message Format

Identifier: Single motor command sending: 0x140 + ID(1~32)
Multi-motor command sending: 0x280
Reply: 0x240 + ID (1~32)
Frame format: Data frame
Frame Type: Standard Frame
DLC: 8 bytes

### 1.2. RS485 Bus

#### 1.2.1. Parameters

Bus interface: RS485
Baudrate:115200bps,500Kbps,1Mbps,1.5Mbps,2.5Mbps
Serial port configuration: 8 data bits,1 stop bit,no parity bit

#### 1.2.2. Message Format

| Type               | Data         | Bytes                   | Description                                                                                    |
| ------------------ | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Frame header       | 0x3E         | 1                       | Communication frame header, used for identification.                                           |
| ID                 | 1~32         | 1                       | Device address, corresponding to the ID number of each motor.                                  |
| Data Length        | Data Length  | 1                       | The length of the data field. In the standard protocol, the length is fixed to 8 bytes.        |
| Data field content | Data content | According to the length | The content of the data field in the standard protocol is exactly the same as that of the CAN. |
| Check              | CRC Check    | 2                       | CRC16 check, low order first, high order last.                                                 |

## 2. Single Motor Command Description

### 2.1. Read PID Parameter Command (0x30)

#### 2.1.1. Instruction Description

This command can read the PID parameters of the current,speed and position,the data
type is Float,determined by the index value. For details,see 2.1.4 Index description
table.

#### 2.1.2. Send Data Field Definition

| Data field | Description     | Data                     |
| ---------- | --------------- | ------------------------ |
| DATA[0]    | Command byte    | 0x30                     |
| DATA[1]    | Parameter index | DATA[1] = (uint8_t)index |
| DATA[2]    | NULL            | 0x00                     |
| DATA[3]    | NULL            | 0x00                     |
| DATA[4]    | NULL            | 0x00                     |
| DATA[5]    | NULL            | 0x00                     |
| DATA[6]    | NULL            | 0x00                     |
| DATA[7]    | NULL            | 0x00                     |

#### 2.1.3. Reply Data Field Definition

| Data field | Description          | Data                           |
| ---------- | -------------------- | ------------------------------ |
| DATA[0]    | Command byte         | 0x30                           |
| DATA[1]    | Function index       | DATA[1] = (uint8_t)index       |
| DATA[2]    | NULL                 | 0x00                           |
| DATA[3]    | NULL                 | 0x00                           |
| DATA[4]    | Parameter low byte 1 | DATA[4] = (uint8_t)(Value)     |
| DATA[5]    | Parameter byte 2     | DATA[5] = (uint8_t)(Value>>8)  |
| DATA[6]    | Parameter byte 3     | DATA[6] = (uint8_t)(Value>>16) |
| DATA[7]    | Parameter byte 4     | DATA[7] = (uint8_t)(Value>>24) |

#### 2.1.4. Function Index Description

| Index | Parameter                  |
| ----- | -------------------------- |
| 0x01  | Current loop KP parameter  |
| 0x02  | Current loop KI parameter  |
| 0x04  | Speed loop KP parameter    |
| 0x05  | Speed loop KI parameter    |
| 0x07  | Position loop KP parameter |
| 0x08  | Position loop KI parameter |
| 0x09  | Position loop KD parameter |

#### 2.1.5. Communication Example

Example 1：

Send command：

CAN:

| ID    | Data[0] | Data[1] | Data[2] | Data[3] | Data[4] | Data[5] | Data[6] | Data[7] |
| ----- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| 0x141 | 0x30    | 0x01    | 0x00    | 0x00    | 0x00    | 0x00    | 0x00    | 0x00    |

RS485:
Frame
header

| ID   | Length | D0   | D1   | D2   | D3   | D4   | D5   | D6   | D7   | CRC16L | CRC16H |
| ---- | ------ | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ------ | ------ |
| 0x3E | 0x01   | 0x08 | 0x30 | 0x01 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | CRC16L | CRC16H |

Description：

According to the index value table,Data[1] = 0x01,it means the current loop KP and
indicates the read current loop KP parameter.

Reply command:

CAN:

| ID    | Data[0] | Data[1] | Data[2] | Data[3] | Data[4] | Data[5] | Data[6] | Data[7] |
| ----- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| 0x241 | 0x30    | 0x01    | 0x00    | 0x00    | 0x00    | 0x00    | 0x80    | 0x3F    |

RS485:
Frame
header

| ID   | Length | D0   | D1   | D2   | D3   | D4   | D5   | D6   | D7   | CRC16L | CRC16H |
| ---- | ------ | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ------ | ------ |
| 0x3E | 0x01   | 0x08 | 0x30 | 0x01 | 0x00 | 0x00 | 0x00 | 0x00 | 0x80 | 0x3F   | CRC16H |

Description：

In the frame data returned,Data[1]=0x01,it means the current loop KP parameter. From
Data[4] to Data[7],these form a 32-bit data that is 0x3F800000,(Data[4] is the lowest
bit,Data[7] is the highest bit),and the data type is Float. When convert it to decimal,the
data is 1.0,this means that the current loop KP parameter at this time is 1.0.
The online conversion website can be used: http://www.speedfly.cn/tools/hexconvert/.

### 2.2. Write PID Parameters to RAM Command (0x31)

#### 2.2.1. Instruction Description

This command can write the parameters of current,speed,position loop KP and KI to
RAM at one time,and it will not be saved after power off. The data type is Float,and it is
determined by the index value. For details,see 2.2.4 Index Description Table. Be careful
to avoid writing parameters when the motor has just started and is in motion.

#### 2.2.2. Send Data Field Definition

| Data field | Description          | Data                           |
| ---------- | -------------------- | ------------------------------ |
| DATA[0]    | Command byte         | 0x31                           |
| DATA[1]    | Function index       | DATA[1] = (uint8_t)index       |
| DATA[2]    | NULL                 | 0x00                           |
| DATA[3]    | NULL                 | 0x00                           |
| DATA[4]    | Parameter low byte 1 | DATA[4] = (uint8_t)(Value)     |
| DATA[5]    | Parameter byte 2     | DATA[5] = (uint8_t) (Value>>8) |
| DATA[6]    | Parameter byte 3     | DATA[6] = (uint8_t)(Value>>16) |
| DATA[7]    | Parameter byte 4     | DATA[7] = (uint8_t)(Value>>24) |

#### 2.2.3. Reply Data Field Definition

The content of the reply data is the same as the sent data.

#### 2.2.4. Function Index Description

```
          Index                                   Parameter
          0x01                                    Current loop KP parameter
          0x02                                    Current loop KI parameter
          0x04                                    Speed loop KP parameter
          0x05                                    Speed loop KI parameter
          0x07                                    Position loop KP parameter
          0x08                                    Position loop KI parameter
          0x09                                    Position loop KD parameter
```

#### 2.2.5. Communication Example

Example 1:

Send command:

```
CAN:
ID        Data[0]        Data[1]   Data[2]     Data[3]    Data[4]     Data[5]     Data[6]    Data[7]
0x141     0x31           0x01      0x00        0x00       0x00        0x00        0xC0       0x3F
```

```
RS485:
Frame
         ID      Length     D0     D1     D2       D3      D4       D5       D6    D7       CRC16L   CRC16H
header

0x3E     0x01     0x08     0x31    0x01   0x00    0x00    0x00      0x00   0xC0    0x3F     CRC16L   CRC16H

```

Description:

Data[1] = 0x01,and it means the current loop KP parameter. From Data[4] to
Data[7],these form a 32-bit data that is 0x3FC00000,(Data[4] is the lowest bit,Data[7] is
the highest bit) ,and the data type is Float. When convert it to decimal,the data value is
1.5,this means that the current loop KP parameter is set to 1.5 and written to the RAM
of the motor drive. In addition,the parameter is not saved after power off.
The online conversion website can be used: http://www.speedfly.cn/tools/hexconvert/.

Reply command:

```
CAN：
ID        Data[0]       Data[1]   Data[2]     Data[3]      Data[4]     Data[5]     Data[6]    Data[7]
0x241     0x31          0x01      0x00        0x00         0x00        0x00        0xC0       0x3F
```

```
RS485:
Frame
         ID      Length    D0     D1     D2         D3      D4       D5       D6    D7       CRC16L   CRC16H
header

0x3E     0x01    0x08     0x31    0x01   0x00      0x00     0x00     0x00   0xC0    0x3F     CRC16L   CRC16H


```

### 2.3. Write PID Parameters to ROM Command (0x32)

#### 2.3.1. Instruction Description

This command can write the parameters of current,speed,position loop KP and KI to
ROM at one time,which can be saved after power off. The data type is Float and can be
determined by the index value ,as detailed in 2.2.4 Index Description. Be careful to
avoid writing parameters when the motor has just started and is in motion.

#### 2.3.2. Send Data Field Definition

| Data Field | Description          | Data                           |
| ---------- | -------------------- | ------------------------------ |
| DATA[0]    | Command byte         | 0x32                           |
| DATA[1]    | Function index       | DATA[1] = (uint8_t)index       |
| DATA[2]    | NULL                 | 0x00                           |
| DATA[3]    | NULL                 | 0x00                           |
| DATA[4]    | Parameter low byte 1 | DATA[4] = (uint8_t)(Value)     |
| DATA[5]    | Parameter byte 2     | DATA[5] = (uint8_t) (Value>>8) |
| DATA[6]    | Parameter byte 3     | DATA[6] = (uint8_t)(Value>>16) |
| DATA[7]    | Parameter byte 4     | DATA[7] = (uint8_t)(Value>>24) |

```

#### 2.3.3. Reply Data Field Definition

The content of the reply data is the same as the sent data.

#### 2.3.4. Function Index Description

```

          Index                                     Parameter
          0x01                                      Current loop KP parameter
          0x02                                      Current loop KI parameter
          0x04                                      Speed loop KP parameter
          0x05                                      Speed loop KI parameter
          0x07                                      Position loop KP parameter
          0x08                                      Position loop KI parameter
          0x09                                      Position loop KD parameter

```

#### 2.3.5. Communication Example

Example 1:

Send command:

```

CAN:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x32 0x01 0x00 0x00 0x00 0x00 0xC0 0x3F

```

```

RS485:
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x32 0x01 0x00 0x00 0x00 0x00 0xC0 0x3F CRC16L CRC16H

```

Description:

Data[1] = 0x01,and it means the current loop KP parameter. From Data[4] to
Data[7],these form a 32-bit data that is 0x3FC00000,(Data[4] is the lowest bit,Data[7] is
the highest bit) ,and the data type is Float. When convert it to decimal,the data value is
1.5,this means that the current loop KP parameter is set to 1.5 and written to the ROM
of the motor drive. In addition,the parameter is saved after the power is off.
The online conversion website can be used: http://www.speedfly.cn/tools/hexconvert/.

Reply command:

```

CAN：

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x32 0x01 0x00 0x00 0x00 0x00 0xC0 0x3F

```

```

RS485:
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x32 0x01 0x00 0x00 0x00 0x00 0xC0 0x3F CRC16L CRC16H

```

### 2.4. Read Acceleration Command (0x42)

#### 2.4.1. Instruction Description

The host sends this command to read the acceleration parameters of the current motor.

#### 2.4.2. Send Data Field Definition

| Data field | Description    | Data                     |
| ---------- | -------------- | ------------------------ |
| DATA[0]    | Command byte   | 0x42                     |
| DATA[1]    | Function index | DATA[1] = (uint8_t)index |
| DATA[2]    | NULL           | 0x00                     |
| DATA[3]    | NULL           | 0x00                     |
| DATA[4]    | NULL           | 0x00                     |
| DATA[5]    | NULL           | 0x00                     |
| DATA[6]    | NULL           | 0x00                     |
| DATA[7]    | NULL           | 0x00                     |

#### 2.4.3. Reply Data Field Definition

The acceleration parameter is included in the drive response data. Acceleration data
Accel is int32_t type,the unit is 1dps/s,and the parameter range is 100-60000.

| Data field | Description               | Data                         |
| ---------- | ------------------------- | ---------------------------- |
| DATA[0]    | Command byte              | 0x42                         |
| DATA[1]    | Function index            | DATA[1] = (uint8_t)index     |
| DATA[2]    | NULL                      | 0x00                         |
| DATA[3]    | NULL                      | 0x00                         |
| DATA[4]    | Acceleration low byte 1   | DATA[4] = (uint8_t)(Accel)   |
| DATA[5]    | Acceleration byte 2       | DATA[5] = (uint8_t)(Accel>>8) |
| DATA[6]    | Acceleration byte 3       | DATA[6] = (uint8_t)(Accel>>16) |
| DATA[7]    | Acceleration byte 4       | DATA[7] = (uint8_t)(Accel>>24) |

#### 2.4.4. Function Index Description

```

Index value Command name Function description

0x00 Position planning Acceleration value from initial velocity to
acceleration maximum velocity in position planning

0x01 Position planning Deceleration value from maximum velocity to
deceleration standstill in position planning

0x02 Peed planning The acceleration value from the current speed to
acceleration the target speed,including the acceleration in the

```

                                           positive and negative directions

0x03 Speed planning The deceleration value to decelerate from the
deceleration current velocity to the target velocity in the same
direction

#### 2.4.5. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x42 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x42 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: Send a command to read the position planning acceleration.

Reply command:

```

CAN:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x42 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x42 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[1] is 0x00,indicating the position planning acceleration value.

Data[4] to data[7] form one (Data[4] is the lowest bit,Data[7] is the highest bit) 32-bit
data is 0x00002710,which means 10000 in decimal. It means that the acceleration of the
motor position loop is 10000dps/s.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x42 0x01 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x42 0x01 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: Send a command to read the position planning deceleration.

Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x42 0x01 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x42 0x01 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[1] is 0x01,indicating the position planning deceleration value.

Data[4] to data[7] form a (Data[4] is the lowest bit,Data[7] is the highest bit) 32-bit data
is 0x00002710,which means 10000 in decimal. It means that the deceleration of the
motor position loop is 10000dps/s.

### 2.5. Write Acceleration to RAM and ROM Command (0x43)

#### 2.5.1. Instruction Description

The host sends this command to write the acceleration into the RAM and ROM,which
can be saved after power off. Acceleration data Accel is uint32_t type,the unit is
1dps/s,and the parameter range is 100-60000. The command contains the acceleration
and deceleration values in the position and velocity planning,which are determined by
the index value. For details,see the index description table in 2.5.4. Be careful to avoid
writing parameters when the motor has just started and is in motion.

#### 2.5.2. Send Data Field Definition

| Data field | Description               | Data                     |
| ---------- | ------------------------- | ------------------------ |
| DATA[0]    | Command byte              | 0x43                     |
| DATA[1]    | Function index            | DATA[1] = (uint8_t)index |
| DATA[2]    | NULL                      | 0x00                     |
| DATA[3]    | NULL                      | 0x00                     |
| DATA[4]    | Acceleration low byte 1   | DATA[4] = (uint8_t)(Accel) |
| DATA[5]    | Acceleration byte 2       | DATA[5] = (uint8_t)(Accel>>8) |
| DATA[6]    | Acceleration byte 3       | DATA[6] = (uint8_t)(Accel>>16) |
| DATA[7]    | Acceleration byte 4       | DATA[7] = (uint8_t)(Accel>>24) |

#### 2.5.3. Reply Data Field Definition

The motor will reply to the host after receiving the command,and the reply command is
the same as the received command.

#### 2.5.4. Function Index Description

```

Index value Command name Function description

0x00 position planning Acceleration value from initial velocity to
acceleration maximum velocity in position planning

0x01 Position planning Deceleration value from maximum speed to
deceleration stop in position planning

0x02 Speed planning The acceleration value from the current speed
acceleration to the target speed,including the acceleration in

```

                                                the forward and reverse directions

0x03 Speed planning In the same direction,the deceleration value
deceleration from the current speed to the target speed

#### 2.5.5. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x43 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[1] is 0x00,indicating the position planning acceleration value .Data[4] to data[7]
form one 32-bit data is 0x00002710,(Data[4] is the lowest bit,Data[7] is the highest
bit) ,which means 10000 in decimal. It indicates that the position planning acceleration
of 10000dps/s is written to the motor driver,and the value can be saved after the power
is turned off.
Reply command:

```

CAN:
ID 号 Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x43 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:The motor replies to the host after receiving the command,and the reply

command is the same as the received command.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x43 0x01 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x01 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[1] is 0x01,indicating the deceleration value of position planning. Data[4] to data[7]
form a 32-bit data,0x00002710,(Data[4] is the lowest bit,Data[7] is the highest
bit),which means 10000 in decimal. Indicates that the position planning deceleration of
10000dps/s is written to the motor driver,and the value can be saved after the power is
turned off.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x43 0x01 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x01 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description: The motor replies to the host computer after receiving the command,and

the reply command is the same as the received command.
Example 3:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x43 0x02 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x02 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description: Data[1] is 0x02,which indicates the acceleration value of speed planning.

Data[4] to data[7] form a 32-bit data,0x00002710, (Data[4] is the lowest bit,Data[7] is
the highest bit),which means 10000 in decimal. Indicates that the speed planning
acceleration of 10000dps/s is written to the motor driver,and the value can be saved
after power off.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x43 0x02 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x02 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description: The motor replies to the host after receiving the command,and the reply

command is the same as the received command.
Example 4:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x43 0x03 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x43 0x03 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description: The motor replies to the host after receiving the command,and the reply

command is the same as the received command.

### 2.6. Read Multi-Turn Encoder Position Data Command (0x60)

#### 2.6.1. Instruction Description

The host sends this command to read the multi-turn position of the encoder,which
represents the rotation angle of the motor output shaft.

#### 2.6.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x60
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.6.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters. Encoder multi-turn position encoder (int32_t type,value range
of multi-turn encoder,4 bytes of valid data),which is the value after subtracting the
encoder's multi-turn zero offset (initial position) from the original position of the
encoder.

```

Data field Description Data

DATA[0] Command byte 0x60
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Encoder position low byte 1 DATA[4] = (uint8_t)(encoder)
DATA[5] Encoder position byte 2 DATA[5] = (uint8_t)(encoder>>8)
DATA[6] Encoder position byte 3 DATA[6] = (uint8_t)(encoder>>16)
DATA[7] Encoder position byte 4 DATA[7] = (uint8_t)(encoder>>24)

```

#### 2.6.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x60 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x60 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

The host sends this command to read the multi-turn position of the encoder.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x60 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x60 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description: Data[4] to data[7] form one 32-bit data,0x00002710,(Data[4] is the lowest

bit,Data[7] is the highest bit),which means 10000 in decimal. The multi-turn encoder
value representing the current relative multi-turn zero offset (initial position) of the
motor is 10000 pulses.

### 2.7. Read Multi-Turn Encoder Original Position Data Command

         (0x61)

#### 2.7.1. Instruction Description

The host sends this command to read the multi-turn encoder home position,ie the
multi-turn encoder value without the zero offset (home position).

#### 2.7.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x61
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.7.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters. Encoder multi-turn raw position encoderRaw (int32_t
type,value range,valid data 4 bytes).

```

Data field Description Data

DATA[0] Command byte 0x61
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Encoder original position byte 1 DATA[4] = (uint8_t)(encoderRaw)
DATA[5] Encoder original position byte 2 DATA[5] = (uint8_t)(encoderRaw>>8)
DATA[6] Encoder original position byte 3 DATA[6] = (uint8_t)(encoderRaw>>16)
DATA[7] Encoder original position byte 4 DATA[7] = (uint8_t)(encoderRaw>>24)

```

#### 2.7.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]

0x141 0x61 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x61 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

The host sends this command to read the original position of the encoder multi-turn.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x61 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x61 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to data[7] form a 32-bit data,0x00002710, (Data[4] is the lowest bit,Data[7] is
the highest bit),which means 10000 in decimal. Indicates that the current multi-turn
encoder value of the motor is 10000 pulses,excluding the zero offset (initial position).

### 2.8. Read Multi-Turn Encoder Zero Offset Data Command (0x62)

#### 2.8.1. Instruction Description

The host sends this command to read the multi-turn zero offset value (initial position) of
the encoder.

#### 2.8.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x62
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.8.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters. Encoder multi-turn zero offset encoderOffset (int32_t
type,value range,valid data 4 bytes).

```

Data field Description Data

DATA[0] Command byte 0x62
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Encoder offset byte 1 DATA[4] = (uint8_t)(encoderOffset)
DATA[5] Encoder offset byte 2 DATA[5] = (uint8_t)(encoderOffset>>8)
DATA[6] Encoder offset byte 3 DATA[6] = (uint8_t)(encoderOffset>>16)
DATA[7] Encoder offset byte 4 DATA[7] = (uint8_t)(encoderOffset>>24)

```

#### 2.8.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x62 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x62 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

The host sends this command to read the multi-turn zero offset value of the encoder.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x62 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x62 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to data[7] form one 32-bit data,0x00002710,(Data[4] is the lowest bit,Data[7] is
the highest bit),which means 10000 in decimal. It indicates that the current multi-turn
encoder zero offset value of the motor is 10000 pulses.

### 2.9. Write Encoder Multi-Turn Value to ROM as Motor Zero

         Command (0x63)

#### 2.9.1. Instruction Description

The host sends this command to set the zero offset (initial position) of the
encoder,where the encoder multi-turn value to be written,encoderOffset,is of type
int32_t,(value range,4 bytes of valid data). Be careful to avoid writing parameters when
the motor has just started and is in motion.

#### 2.9.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x63
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Encoder zero bias low byte 1 DATA[4] = (uint8_t)(encoderOffset)
DATA[5] Encoder zero bias byte 2 DATA[5] = (uint8_t)(encoderOffset>>8)
DATA[6] Encoder zero bias byte 3 DATA[6] = (uint8_t)(encoderOffset>>8)
DATA[7] Encoder zero bias byte 4 DATA[7] = (uint8_t)(encoderOffset>>8)

```

#### 2.9.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data is the
same as the command sent by the host.

#### 2.9.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x63 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x63 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to data[7] form one 32-bit data is 0x00002710,(Data[4] is the lowest bit,Data[7]
is the highest bit),which means 10000 in decimal. It means to write 10000 pulses as
multi-turn encoder zero offset.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x63 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x63 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

The motor replies to the host after receiving the command,and the frame data is the
same as the command sent by the host.

### 2.10. Write the Current Multi-Turn Position of the Encoder to

         the ROM as the Motor Zero Command (0x64)

#### 2.10.1. Instruction Description

Write the current encoder position of the motor as the multi-turn encoder zero offset
(initial position) into the ROM.
Note: After writing the new zero point position,you need to send 0x76 (system reset

command) to restart the system to be effective. Because of the change of the zero
offset,the new zero offset (initial position) should be used as a reference when setting
the target position.

#### 2.10.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x64
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.10.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the encoderOffset in the
data is the set zero offset value.

```

Data field Description Data

DATA[0] Command byte 0x64
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Encoder zero bias low byte 1 DATA[4] = (uint8_t)(encoderOffset)
DATA[5] Encoder zero bias byte 2 DATA[5] = (uint8_t)(encoderOffset>>8)
DATA[6] Encoder zero bias byte 3 DATA[6] = (uint8_t)(encoderOffset>>16)
DATA[7] Encoder zero bias byte 4 DATA[7] = (uint8_t)(encoderOffset>>24)

```

#### 2.10.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x64 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x64 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

After sending the 0x64 command,the motor will write the current multi-turn encoder
value as the zero offset (initial position) into the ROM.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x64 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H

header

0x3E 0x01 0x08 0x64 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to data[7] form a 32-bit data(Data[4] is the lowest bit,Data[7] is the highest
bit),0x00002710,which means 10000 in decimal. Indicates that the multi-turn zero
offset value (initial position) written to the motor is 10,000 pulses.

### 2.11. Read Single-Turn Encoder Command (0x90)

#### 2.11.1. Instruction Description

The host sends this command to read the current position of the encoder. Note that the
current command is used as a single-turn data reading command for direct drive motors.

#### 2.11.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x90
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.11.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Encoder position encoder,the value after subtracting the encoder's zero offset from

the original position of the encoder;

## 2. Encoder original position: encoderRaw;

## 3. Encoder's zero offset: encoderOffset,this point serves as the zero point of the motor

angle.

```

Data field Description Data

DATA[0] Command byte 0x90
DATA[1] NULL 0x00
DATA[2] Encoder position low byte DATA[1] = (uint8_t)(encoder)
DATA[3] Encoder position high byte DATA[2] = (uint8_t)(encoder>>8)
DATA[4] Encoder original position low byte DATA[3] = (uint8_t)(encoderRaw)
DATA[5] Encoder original position high byte DATA[4]= (uint8_t)(encoderRaw>>8)
DATA[6] Encoder zero bias low byte DATA[5] = (uint8_t)(encoderOffset)
DATA[7] Encoder zero bias high byte DATA[6]= (uint8_t)(encoderOffset>>8)

```

#### 2.11.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x90 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x90 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

After sending the 0x90 command,it will return the motor single-turn encoder value.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x90 0x00 0x33 0x08 0xBE 0x2C 0x8B 0x24

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x90 0x00 0x33 0x08 0xBE 0x2C 0x8B 0x24 CRC16L CRC16H

```

Description：

Data[2] to data[3] form a 16-bit data, 0x0833,(Data[2] is the lowest bit,Data[3] is the
highest),which means 2099 in decimal ,which means that the current position of the
encoder relative to the zero offset of the motor is 2099 pulses. Data[4] to data[5] make
up one (Data[4] is the lowest bit,Data[5] is the highest bit) 16-bit data is 0x2CBE,which
means 11454 in decimal,which means that the current encoder original position of the
motor is 11454 pulse. Data[6] to data[7] form one 16-bit data is 0x248B, (Data[6] is the
lowest bit,Data[7] is the highest bit),which means 9355 in decimal,which means that the
zero offset position of the motor is 9355 pulse.

### 2.12. Read Multi-Turn Angle Command (0x92)

#### 2.12.1. Instruction Description

The host sends this command to read the current multi-turn absolute angle value of the
motor.

#### 2.12.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x92
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.12.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Motor angle motorAngle, (int32_t type, value range, valid data 4 bytes), unit

0.01°/LSB.

```

Data field Description Data

DATA[0] Command byte 0x92
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Angle low byte 1 DATA[4] = (uint8_t)(motorAngle)
DATA[5] Angle byte 2 DATA[5] = (uint8_t)(motorAngle>>8)
DATA[6] Angle byte 3 DATA[6] = (uint8_t)(motorAngle>>16)
DATA[7] Angle byte 4 DATA[7] = (uint8_t)(motorAngle>>24)

```

#### 2.12.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x92 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x92 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

After sending the 0x92 command,it will return the absolute angle of the motor output
shaft.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x92 0x00 0x00 0x00 0xA0 0x8C 0x00 0x00

```

```

RS485：

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x92 0x00 0x00 0x00 0xA0 0x8C 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to data[7] form one 32-bit data,it is 0x00008CA0,(Data[4] is the lowest
bit,Data[7] is the highest bit),which means the decimal is 36000,which is reduced by

## 100. times in units of 0.01°/LSB That is 36000\*0.01=360°. Indicates that the motor

output shaft moves 360° in the positive direction relative to the zero position.

### 2.13. Read Single-Turn Angle Command (0x94)

#### 2.13.1. Instruction Description

The host sends this command to read the current single-turn angle of the motor.

#### 2.13.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x94
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.13.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. The single circle angle of the motor,circleAngle,is int16_t type data,starting from the

zero point of the encoder,increasing clockwise,and returning to 0 when it reaches the
zero point again,the unit is 0.01°/LSB,and the value range is 0~35999.

```

Data field Description Data
DATA[0] Command byte 0x94
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] Single circle angle low byte DATA[5] = (uint8_t)(circleAngle)
DATA[7] Single circle angle high byte DATA[6] = (uint8_t)(circleAngle>>8)

```

#### 2.13.4. Communication Example

Example 1：

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x94 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x94 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

After sending the 0x94 command,it will return the motor single-turn angle.
Reply command：

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x94 0x00 0x00 0x00 0x00 0x00 0x10 0x27

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x94 0x00 0x00 0x00 0x00 0x00 0x10 0x27 CRC16L CRC16H

```

Description:

Data[6] to data[7] form one (Data[6] is the lowest bit,Data[7] is the highest bit) 16-bit
data is 0x2710,which means is 10000 in decimal,and the unit is 0.01°. Indicates that the
motor is currently at 100° relative to the zero position.

### 2.14. Read Motor Status 1 and Error Flag Command (0x9A)

#### 2.14.1. Instruction Description

This command reads the current motor temperature,voltage and error status flags.

#### 2.14.2. Send Data Field Definition

| Data field | Description   | Data |
| ---------- | ------------- | ---- |
| DATA[0]    | Command byte  | 0x9A |
| DATA[1]    | NULL          | 0x00 |
| DATA[2]    | NULL          | 0x00 |
| DATA[3]    | NULL          | 0x00 |
| DATA[4]    | NULL          | 0x00 |
| DATA[5]    | NULL          | 0x00 |
| DATA[6]    | NULL          | 0x00 |
| DATA[7]    | NULL          | 0x00 |

#### 2.14.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters:

## 1. Motor temperature temperature (int8_t type,unit 1℃/LSB);

## 2. Brake control command: Indicates the state of the brake control command,1

represents the brake release command,and 0 represents the brake lock command;

## 3. Voltage (uint16_t type,unit 0.1V/LSB);

## 4. Error flag errorState (of type uint16_t,each bit represents a different motor state).

```

Data field Description Data

DATA[0] Command byte 0x9A
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] NULL 0x00
DATA[3] Brake release command DATA[3] = (uint8_t)(RlyCtrlRslt)
DATA[4] Voltage low byte DATA[4] = (uint8_t)(voltage)
DATA[5] Voltage high byte DATA[5] = (uint8_t)(voltage>>8)
DATA[6] Error status low byte 1 DATA[6] = (uint8_t)(errorState)
DATA[7] Error status byte 2 DATA[7] = (uint8_t)(errorState>>8)

```

Remark:

## 1. System abnormal state value System_errorState state table 1 is as follows:

```

System_errorState Status Description
0x0002 Motor stall

0x0004 Low voltage

0x0008 Over voltage

0x0010 Over current

0x0040 Power overrun

0x0080 Calibration parameter writing error

0x0100 Speeding

0x1000 Motor temperature over temperature

0x2000 Encoder calibration error

```

## 2. When multiple errors occur at the same time,the error status bits will be displayed

superimposed. For example,if the number 0x0016 appears,it means the addition of
0x2+0x4+0x10,which means that there are three errors such as motor stall,low
voltage,and phase current over current.

#### 2.14.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x9A 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x9A 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

After sending the 0x9A command,the temperature,voltage and error status flags of the
motor will be returned.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x9A 0x32 0x00 0x01 0xE5 0x01 0x04 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x9A 0x32 0x00 0x01 0xE5 0x01 0x04 0x00 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. Data[3] indicates that the brake indicates the state of the brake control
command,1 represents the brake release command,and 0 represents the brake lock
command. So 0x01 indicates that the current brake release command has been executed.
Data[4] and Data[5] (Data[4] is the low bit,Data[5] is the high bit) form 0x01E5,the
decimal is 485,which is reduced by 10 times according to the unit of
0.1V/LSB,485\*0.1=48.5V,representing The current motor supply voltage is 48.5V.
Data[6] and Data[7] (Data[6] is low and Data[7] is high) form 0x0004,which indicates a
low-voltage error according to the error description in the System_errorState table.

### 2.15. Read Motor Status 2 Command (0x9C)

#### 2.15.1. Instruction Description

This command reads the temperature,speed and encoder position of the current motor.

#### 2.15.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x9C
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.15.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.
1.Motor temperature temperature (int8_t type,1℃/LSB);
2.The torque current value iq of the motor (int16_t type,0.01A/LSB);
3.Motor output shaft speed (int16_t type,1dps/LSB);
4.Motor output shaft angle (int16_t type,1degree/LSB,maximum range ±32767degree).

```

Data field Description Data

DATA[0] Command byte 0x9C
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Torque current low byte DATA[2] = (uint8_t)(iq)
DATA[3] Torque current high byte DATA[3] = (uint8_t)(iq>>8)
DATA[4] Motor speed low byte DATA[4] = (uint8_t)(speed)
DATA[5] Motor speed high byte DATA[5] = (uint8_t)(speed>>8)
DATA[6] Motor angle low byte DATA[6] = (uint8_t)(degree)
DATA[7] Motor angle high byte DATA[7] = (uint8_t)(degree>>8)

```

#### 2.15.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x9C 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x9C 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

This command reads the current temperature,speed and encoder position of the motor.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x9C 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x9C 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3] 0x0064 is 100 in decimal,and it is
100\*0.01=1A when scaled down by 100 times,which means that the actual current of
the current motor is 1A. The composite data 0x01F4 of Data[4] and Data[5] is 500 in
decimal,which means the motor output shaft speed is 500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7] 0x002D is 45 in decimal,which means that the
motor output shaft moves 45 degrees in the positive direction relative to the zero
position. The position of the motor output shaft is related to the number of lines of the

motor encoder and the reduction ratio. For example,if the number of lines of the motor
encoder is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to 16384\*6 = 98304 pulses.

### 2.16. Read Motor Status 3 Command (0x9D)

#### 2.16.1. Instruction Description

This command reads the current motor temperature and phase current data.

#### 2.16.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x9D
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.16.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following data:

## 1. Motor temperature temperature (int8_t type,1℃/LSB);

## 2. Phase A current data,the data type is int16_t,and the corresponding actual phase

current is 0.01ALSB;
3.B-phase current data,the data type is int16_t type,and the corresponding actual phase
current is 0.01ALSB;

## 4. C-phase current data,the data type is int16_t type,and the corresponding actual phase

current is 0.01ALSB.

```

Data field Description Data

DATA[0] Command byte 0x9D
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Phase A current low byte DATA[2] = (uint8_t)(iA)
DATA[3] Phase A current high byte DATA[3] = (uint8_t)(iA>>8)
DATA[4] Phase B current low byte DATA[4] = (uint8_t)(iB)
DATA[5] Phase B current high byte DATA[5] = (uint8_t)(iB>>8)
DATA[6] Phase C current low byte DATA[6] = (uint8_t)(iC)
DATA[7] Phase C current high byte DATA[7] = (uint8_t)(iC>>8)

```

#### 2.16.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x9D 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x9D 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

This command reads the current motor temperature and phase current data.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x9D 0x32 0xC2 0x0B 0x10 0xFA 0xC0 0xF9

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x9D 0x32 0xC2 0x0B 0x10 0xFA 0xC0 0xF9 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data 0x0BC2 of Data[2] and Data[3] is 3010 in decimal,and it
is 3010*0.01=30.1A when scaled down by 100 times,which means that the actual
current of the current phase A of the motor is 30.1A. The composite data 0xFA10 of
Data[4] and Data[5] is -1520 in decimal,and it is -1520*0.01=-15.2A when scaled down
by 100 times,which means that the actual current of the current phase B of the motor is
-15.2A. The composite data 0xF9C0 of Data[6] and Data[7] is -1600 in decimal,and it is
-1600\*0.01=-16A when scaled down by 100 times,which means that the actual current
of the current phase C of the motor is -16A.

### 2.17. Motor Shutdown Command (0x80)

#### 2.17.1. Instruction Description

Turns off the motor output and also clears the motor running state,not in any closed loop
mode.

#### 2.17.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x80
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.17.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data is the
same as that sent by the host.

### 2.18. Motor Stop Command (0x81)

#### 2.18.1. Instruction Description

Stop the motor,the closed-loop mode where the motor is still running,just stop the motor
speed.

#### 2.18.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x81
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.18.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data is the
same as that sent by the host

### 2.19. Torque Closed-Loop Control Command (0xA1)

#### 2.19.1. Instruction Description

This command is a control command,which can be run when the motor is not faulty.
The host sends this command to control the torque and current output of the motor. The
control value iqControl is of type int16_t and the unit is 0.01A/LSB.
For safety reasons,This command cannot open the brake directly. But, you can use the
0x77 command to open the brake first, then you can use A1 command .

#### 2.19.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xA1
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Torque current control value low byte DATA[4] = (uint8_t )(iqControl)
DATA[5] Torque current control value high byte DATA[5]=(uint8_t )(iqControl>>8)
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.19.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Motor temperature temperature (int8_t type,1℃/LSB).

## 2. The torque current value iq of the motor (int16_t type,0.01A/LSB).

## 3. Motor output shaft speed (int16_t type,1dps/LSB).

## 4. Motor output shaft angle (int16_t type,1degree/LSB,maximum range ±32767degree).

```

Data field Description Data

DATA[0] Command byte 0xA1
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Torque current low byte DATA[2] = (uint8_t)(iq)
DATA[3] Torque current high byte DATA[3] = (uint8_t)(iq>>8)
DATA[4] Motor speed low byte DATA[4] = (uint8_t)(speed)
DATA[5] Motor speed high byte DATA[5] = (uint8_t)(speed>>8)
DATA[6] Motor angle low byte DATA[6] = (uint8_t)(degree)
DATA[7] Motor angle high byte DATA[7] = (uint8_t)(degree>>8)

```

#### 2.19.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA1 0x00 0x00 0x00 0x64 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA1 0x00 0x00 0x00 0x64 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] and data[5] represent the data size,Data[4] (0x64) is the low bit,and Data[5]
(0x00) is the high bit. So the actual data is 0x0064,which means decimal 100,which is
100\*0.01=1A when reduced by 0.01A/LSB. Driving will be performed with 1A as the
target current.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA1 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA1 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3],0x0064,is 100 in decimal,and it is
100*0.01=1A when scaled down by 100 times,which means that the actual current of
the current motor is 1A. The composite data 0x01F4 of Data[4] and Data[5] is 500 in
decimal,which means the motor output shaft speed is 500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7] 0x002D is 45 in decimal,which means that the
motor output shaft moves 45 degrees in the positive direction relative to the zero
position. The position of the motor output shaft is related to the number of lines of the
motor encoder and the reduction ratio. For example,if the number of lines of the motor
encoder is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to 16384*6 = 98304 pulses.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA1 0x00 0x00 0x00 0x9C 0xFF 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA1 0x00 0x00 0x00 0x9C 0xFF 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] and data[5] represent the data size,Data[4] (0x9C) is the low bit,Data[5] (0xFF)
is the high bit. So the actual data is 0xFF9C,which means decimal -100,which is
-100\*0.01= -1A when reduced by 0.01A/LSB. The drive will be performed with -1A as
the target current.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA1 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA1 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3] 0xFF9C is -100 in decimal,and it is
-100\*0.01=-1A when scaled down by 100 times,which means that the actual current of

the current motor is -1A. The composite data 0xFE0C of Data[4] and Data[5] is -500 in
decimal,which means the motor output shaft speed is -500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7] 0xFFD3 is -45 in decimal,which means that the
motor output shaft moves in the opposite direction by -45 degrees relative to the zero
position. The position of the motor output shaft is related to the number of motor
encoder lines and the reduction ratio. For example,if the number of motor encoder lines
is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to16384\*6 = 98304 pulses.

### 2.20. Speed Closed-Loop Control Command (0xA2)

#### 2.20.1. Instruction Description

This command is a control command,which can be run when the motor is not faulty.
The host sends this command to control the speed of the motor output shaft. The control
value speedControl is int32_t type,and the corresponding actual speed is 0.01dps/LSB.

#### 2.20.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xA2
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Speed control low byte DATA[4] = (uint8_t)(speedControl)
DATA[5] Speed control DATA[5] = (uint8_t)(speedControl>>8)
DATA[6] Speed control DATA[6] = (uint8_t)(speedControl>>16)
DATA[7] Speed control high byte DATA[7] = (uint8_t)(speedControl>>24)

```

Remark:

## 1. The maximum torque current of the motor under this command is limited by the Max

Torque Current value in the host computer;

## 2. In this control mode,the maximum acceleration of the motor is limited by the Max

Acceleration value in the host computer;

## 3. When the speed loop acceleration value is 0,the speed loop acceleration is limited by

the maximum current output capability.

#### 2.20.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Motor temperature temperature (int8_t type,1℃/LSB);

## 2. The torque current value iq of the motor (int16_t type,0.01A/LSB);

## 3. Motor output shaft speed (int16_t type,1dps/LSB);

## 4. Motor output shaft angle (int16_t type,1degree/LSB,maximum range±32767degree).

```

Data field Description Data
DATA[0] Command byte 0xA2
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Torque current low byte DATA[2] = (uint8_t)(iq)
DATA[3] Torque current high byte DATA[3] = (uint8_t)(iq>>8)
DATA[4] Motor speed low byte DATA[4] = (uint8_t)(speed)
DATA[5] Motor speed high byte DATA[5] = (uint8_t)(speed>>8)
DATA[6] Motor angle low byte DATA[6] = (uint8_t)(degree)
DATA[7] Motor angle high byte DATA[7] = (uint8_t)(degree>>8)

```

#### 2.20.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA2 0x00 0x00 0x00 0x10 0x27 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA2 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to data[7] form one (Data[4] is the lowest bit,Data[7] is the highest bit) 32-bit
data is 0x00002710,which means 10000 in decimal. The sending command is reduced
by 100 times according to 0.01dps/LSB,that is,10000\*0.01=100dps. The drive operates
at the target speed of 100dps of the motor output shaft.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA2 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA2 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3] 0x0064 is 100 in decimal,and it is
100*0.01=1A when scaled down by 100 times,which means that the actual current of
the current motor is 1A. The composite data 0x01F4 of Data[4] and Data[5] is 500 in
decimal,which means the motor output shaft speed is 500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7] 0x002D is 45 in decimal,which means that the
motor output shaft moves 45 degrees in the positive direction relative to the zero
position. The position of the motor output shaft is related to the number of lines of the
motor encoder and the reduction ratio. For example,if the number of lines of the motor
encoder is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to 16384*6 =98304 pulses.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA2 0x00 0x00 0x00 0xF0 0xD8 0xFF 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA2 0x00 0x00 0x00 0xF0 0xD8 0xFF 0xFF CRC16L CRC16H

```

Description:

Data[4] to data[7] form one (Data[4] is the lowest bit,Data[7] is the highest bit) 32-bit
data is 0xFFFFD8F0,which means -10000 in decimal. The sending command is reduced
by 100 times according to 0.01dps/LSB,that is -10000\*0.01=-100dps. The drive runs at
the target speed of the motor output shaft -100dps.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA2 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA2 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3] 0xFF9C is -100 in decimal,and it is
-100\*0.01= -1A when scaled down by 100 times,which means that the actual current of
the current motor is -1A. The composite data 0xFE0C of Data[4] and Data[5] is -500 in
decimal,which means the motor output shaft speed is -500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction

ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7],0xFFD3,is -45 in decimal,which means that the
motor output shaft moves in the opposite direction by -45 degrees relative to the zero
position. The position of the motor output shaft is related to the number of motor
encoder lines and the reduction ratio. For example,if the number of motor encoder lines
is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to 16384*6 = 98304 pulses.

### 2.21. Absolute Position Closed-Loop Control Command (0xA4)

#### 2.21.1. Instruction Description

This command is a control command,which can be run when the motor is not faulty.
The host sends this command to control the position of the motor (multi-turn angle).
The control value angleControl is int32_t type,and the corresponding actual position is
0.01degree/LSB,that is,36000 represents 360°,and the rotation direction of the motor is
determined by the difference between the target position and the current position . The
control value maxSpeed limits the maximum speed of the motor output shaft
rotation,which is of type uint16_t,corresponding to the actual speed of 1dps/LSB.
According to the position planning acceleration value set by the system,different
operating modes will be different:
1.If the position loop acceleration is 0,then the position loop will enter the direct
tracking mode,and directly track the target position through the PI controller. Among
them,maxSpeed limits the maximum speed during the position operation process. If the
maxSpeed value is 0,then it is completely output by the calculation result of the PI
controller. As shown below.

            Figure 2-1 Block Diagram of Position Tracking Mode with Speed Limit

2.If the position loop acceleration is not 0,then the motion mode with speed planning
will be run,and the motor will complete the acceleration and deceleration process. The
maximum operating speed is determined by maxSpeed,and the acceleration is
determined by the acceleration set by the position loop.

#### 2.21.2. Send Data Field Definition

```

Data field Description Data
DATA[0] Command byte 0xA4
DATA[1] NULL 0x00
DATA[2] Speed limit low byte DATA[2] = (uint8_t)(maxSpeed)
DATA[3] Speed limit high byte DATA[3] = (uint8_t)(maxSpeed>>8)
DATA[4] Position control low byte DATA[4] = (uint8_t)(angleControl)
DATA[5] Position control DATA[5] = (uint8_t)(angleControl>>8)
DATA[6] Position control DATA[6] = (uint8_t)(angleControl>>16)
DATA[7] Position control high byte DATA[7] = (uint8_t)(angleControl>>24)

```

#### 2.21.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Motor temperature temperature (int8_t type,1℃/LSB).

## 2. The torque current value iq of the motor (int16_t type,0.01A/LSB).

## 3. Motor output shaft speed (int16_t type,1dps/LSB).

## 4. Motor output shaft angle (int16_t type,1degree/LSB,maximum range ±32767degree).

```

Data field Description Data
DATA[0] Command byte 0xA4
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Torque current low byte DATA[2] = (uint8_t)(iq)
DATA[3] Torque current high byte DATA[3] = (uint8_t)(iq>>8)
DATA[4] Motor speed low byte DATA[4] = (uint8_t)(speed)
DATA[5] Motor speed high byte DATA[5] = (uint8_t)(speed>>8)

DATA[6] Motor angle low byte DATA[6] = (uint8_t)(degree)
DATA[7] Motor angle high byte DATA[7] = (uint8_t)(degree>>8)

```

#### 2.21.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA4 0x00 0xF4 0x01 0xA0 0x8C 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA4 0x00 0xF4 0x01 0xA0 0x8C 0x00 0x00 CRC16L CRC16H

```

Description:

Data[2] and Data[3] form one (Data[2] is low,Data[3] is high) 16-bit data is
0x01F4,indicating the decimal 500dps motor output shaft speed. The drive will run the
position loop at this speed as the maximum speed. Data[4] to data[7] form a (Data[4] is
the lowest bit,Data[7] is the highest bit) 32-bit data is 0x00008CA0,which means 36000
in decimal. The sending command is reduced by 100 times according to
0.01degree/LSB,that is,36000\*0.01=360°. The motor will move forward 360° with the
output shaft relative to the zero position.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA4 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA4 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data 0x0064 of Data[2] and Data[3] is 100 in decimal,which is
100*0.01=1A according to the 100-fold reduction,which means that the actual current of
the motor is 1A. The synthetic data 0x01F4 of Data[4] and Data[5] is 500 in
decimal,which means the motor output shaft speed is 500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,the motor speed is 6 times higher than the output shaft speed. The composite
data 0x002D of Data[6] and Data[7] is 45 in decimal,which means that the motor output
shaft moves forward by 45 degrees relative to the zero position. The position of the
motor output shaft is related to the number of lines of the motor encoder and the
reduction ratio. For example,the number of lines of the motor encoder is 16384 and the
reduction ratio is 6. Then 360 degrees of the motor output shaft corresponds to 16384*6
= 98304 pulses.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA4 0x00 0xF4 0x01 0x60 0x73 0xFF 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA4 0x00 0xF4 0x01 0x60 0x73 0xFF 0xFF CRC16L CRC16H

```

Description:

Data[2] and Data[3] form one (Data[2] is low,Data[3] is high) 16-bit data is
0x01F4,indicating the decimal 500dps motor output shaft speed. The drive will run the
position loop at this speed as the maximum speed. Data[4] to data[7] form a (Data[4] is
the lowest bit,Data[7] is the highest bit) 32-bit data is 0xFFFF7360,which means -36000
in decimal. The sending command is reduced by 100 times according to
0.01degree/LSB,that is,-36000\*0.01=-360°. The motor will move -360° in reverse
with respect to the zero position of the output shaft.
Reply command:

```

CAN:
ID 号 Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA4 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA4 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. Data[2] and Data[3] synthesized data 0xFF9C is -100 in decimal,which is
-100*0.01=-1A when scaled down by 100 times,which means the actual current of the
motor is -1A. The synthetic data 0xFE0C of Data[4] and Data[5] is -500 in
decimal,which means that the motor output shaft speed is -500dps. There is a reduction
ratio relationship between the motor output shaft speed and the motor speed. If the
reduction ratio is 6,the motor speed is 6 times higher than the output shaft speed. The
synthetic data 0xFFD3 of Data[6] and Data[7] is -45 in decimal,which means that the
output shaft of the motor moves backward by -45 degrees relative to the zero position.
The position of the motor output shaft is related to the number of lines of the motor
encoder and the reduction ratio. For example,the number of lines of the motor encoder
is 16384 and the reduction ratio is 6. Then 360 degrees of the motor output shaft
corresponds to 16384*6 = 98304 pulses.

### 2.22. Single-Turn Position Control Command (0xA6)

#### 2.22.1. Instruction Description

The host sends this command to control the position of the motor (single-turn angle).
When the multi-lap save function is turned off,the default is single-lap mode. This

instruction can be used in single-turn mode.

## 1. The angle control value angleControl is of uint16_t type,the value range is

0~35999,and the corresponding actual position is 0.01degree/LSB,that is,the actual
angle range is 0°~359.99°;

## 2. spinDirection sets the direction of motor rotation,which is uint8_t type,0x00 means

clockwise,and 0x01 means counterclockwise;

## 3. maxSpeed limits the maximum speed of motor rotation,which is of uint16_t

type,corresponding to the actual speed of 1dps/LSB.

#### 2.22.2. Send Data Field Definition

```

Data field Description Data
DATA[0] Command byte 0xA6
DATA[1] Rotation direction byte DATA[1] = spinDirection
DATA[2] Speed limit low byte DATA[2] = (uint8_t)(maxSpeed)
DATA[3] Speed limit high byte DATA[3] = (uint8_t)(maxSpeed>>8)
DATA[4] Position Control Low byte DATA[4] = (uint8_t)(angleControl)
DATA[5] Position Control High byte DATA[5] = (uint8_t)(angleControl>>8)
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.22.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Motor temperature temperature (int8_t type,1℃/LSB);

## 2. The torque current value iq of the motor (int16_t type,0.01A/LSB);

## 3. Motor output shaft speed (int16_t type,1dps/LSB);

## 4. Encoder position value encoder (uint16_t type,the value range of the encoder is

determined by the number of bits of the encoder).

```

Data Field Description Data

DATA[0] Command byte 0xA6
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Torque current low byte DATA[2] = (uint8_t)(iq)
DATA[3] Torque current high byte DATA[3] = (uint8_t)(iq>>8)
DATA[4] Motor speed low byte DATA[4] = (uint8_t)(speed)
DATA[5] Motor speed high byte DATA[5] = (uint8_t)(speed>>8)
DATA[6] Encoder value low byte DATA[6] = (uint8_t)(encoder)
DATA[7] Encoder value high byte DATA[7] = (uint8_t)(encoder>>8)

```

#### 2.22.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA6 0x00 0xF4 0x01 0xA0 0x8C 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA6 0x00 0xF4 0x01 0xA0 0x8C 0x00 0x00 CRC16L CRC16H

```

Description:

Data[1] is 0,which means the motor will rotate clockwise. Data[2] and Data[3] form one
(Data[2] is the low bit,Data[3] is the high bit) 16-bit data is 0x01F4,which means the
decimal 500dps motor speed. The drive will run the position loop at this speed as the
maximum speed. Data[4] to data[7] form a (Data[4] is the lowest bit,Data[7] is the
highest bit) 32-bit data is 0x8CA0,which means that the decimal system is 36000,and
the unit is 0.01degree. The motor will move 360° clockwise. The 360-degree and
0-degree positions in the single-lap position coincide,so the position may also be 0
degrees at this time.
Reply command:

```

CAN:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA6 0x32 0x64 0x00 0xF4 0x01 0xE8 0x03

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA6 0x32 0x64 0x00 0xF4 0x01 0xE8 0x03 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data 0x0064 of Data[2] and Data[3] is 100 in decimal,which is
100\*0.01=1A according to the 100-fold reduction,which means that the actual current of
the motor is 1A. Data[4] and Data[5] synthesized data 0x01F4 is 500 in decimal,which
means the motor speed is 500dps. The synthetic data 0x03E8 of Data[6] and Data[7] is

## 1000. in decimal,which means that the value of the motor encoder relative to the zero

position is 1000 pulses.
Example 2：

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA6 0x01 0xF4 0x01 0xA0 0x8C 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA6 0x01 0xF4 0x01 0xA0 0x8C 0x00 0x00 CRC16L CRC16H

```

Description：

Data[1] is 1,which means the motor will rotate counterclockwise. Data[2] and Data[3]
form one (Data[2] is the low bit,Data[3] is the high bit) 16-bit data is 0x01F4,which
means the decimal 500dps motor speed. The drive will run the position loop at this
speed as the maximum speed. Data[4] to data[7] form a (Data[4] is the lowest bit,Data[7]

is the highest bit) 32-bit data is 0x8CA0,which means that the decimal system is
36000,and the unit is 0.01degree. The motor will move 360° in a counterclockwise
direction. The 360-degree and 0-degree positions in the single-lap position coincide,so
the position may also be 0 degrees at this time.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA6 0x32 0x64 0x00 0xF4 0x01 0xE8 0x03

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA6 0x32 0x64 0x00 0xF4 0x01 0xE8 0x03 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data 0x0064 of Data[2] and Data[3] is 100 in decimal,which is
100\*0.01=1A according to the 100-fold reduction,which means that the actual current of
the motor is 1A. Data[4] and Data[5] synthesized data 0x01F4 is 500 in decimal,which
means the motor speed is 500dps. The synthetic data 0x03E8 of Data[6] and Data[7] is

## 1000. in decimal,which means that the value of the motor encoder relative to the zero

position is 1000 pulses.

### 2.23. Incremental Position Closed-Loop Control Command

         (0xA8)

#### 2.23.1. Instruction Description

This command is a control command,which can be run when the motor is not faulty.
The host sends this command to control the incremental position (multi-turn angle) of
the motor,and run the input position increment with the current position as the starting
point. The control value angleControl is of type int32_t,and the corresponding actual
position is 0.01degree/LSB,that is,36000 represents 360°,and the rotation direction of

the motor is determined by the incremental position symbol.
The control value maxSpeed limits the maximum speed of the motor output shaft
rotation,which is of type uint16_t,corresponding to the actual speed of 1dps/LSB.

#### 2.23.2. Send Data Field Definition

```

Data field Description Data
DATA[0] Command byte 0xA8
DATA[1] NULL 0x00
DATA[2] Speed limit low byte DATA[2] = (uint8_t)(maxSpeed)
DATA[3] Speed limit high byte DATA[3] = (uint8_t)(maxSpeed>>8)
DATA[4] Position control low byte DATA[4] = (uint8_t)(angleControl)
DATA[5] Position control DATA[5] = (uint8_t)(angleControl>>8)
DATA[6] Position control DATA[6] = (uint8_t)(angleControl>>16)
DATA[7] Position control high byte DATA[7] = (uint8_t)(angleControl>>24)

```

#### 2.23.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data contains
the following parameters.

## 1. Motor temperature temperature (int8_t type,1℃/LSB).

## 2. The torque current value iq of the motor (int16_t type,0.01A/LSB).

## 3. Motor output shaft speed (int16_t type,1dps/LSB).

## 4. Motor output shaft angle (int16_t type,1degree/LSB,maximum range ±32767degree).

```

Data field Description Data
DATA[0] Command byte 0xA8
DATA[1] Motor temperature DATA[1] = (uint8_t)(temperature)
DATA[2] Torque current low byte DATA[2] = (uint8_t)(iq)
DATA[3] Torque current high byte DATA[3] = (uint8_t)(iq>>8)
DATA[4] Motor speed low byte DATA[4] = (uint8_t)(speed)
DATA[5] Motor speed high byte DATA[5] = (uint8_t)(speed>>8)
DATA[6] Motor angle low byte DATA[6] = (uint8_t)(degree)
DATA[7] Motor angle high byte DATA[7] = (uint8_t)(degree>>8)

```

#### 2.23.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA8 0x00 0xF4 0x01 0xA0 0x8C 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA8 0x00 0xF4 0x01 0xA0 0x8C 0x00 0x00 CRC16L CRC16H

```

Description:

Data[2] and Data[3] form one (Data[2] is the low bit,Data[3] is the high bit) 16-bit data
is 0x01F4,which means the decimal 500dps motor output shaft speed. The drive will run
the position loop at this speed as the maximum speed. Data[4] to data[7] form one
(Data[4] is the lowest bit,Data[7] is the highest bit) 32-bit data is 0x00008CA0,which
means 36000 in decimal. The sending command is reduced by 100 times according to
0.01degree/LSB,that is,36000\*0.01=360°. The motor will move 360° in the positive
direction with the output shaft relative to the current position.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA8 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA8 0x32 0x64 0x00 0xF4 0x01 0x2D 0x00 CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3] 0x0064 is 100 in decimal,and it is
100*0.01=1A when scaled down by 100 times,which means that the actual current of
the current motor is 1A. The composite data 0x01F4 of Data[4] and Data[5] is 500 in
decimal,which means the motor output shaft speed is 500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7] 0x002D is 45 in decimal,which means that the
motor output shaft moves 45 degrees in the positive direction relative to the zero
position. The position of the motor output shaft is related to the number of lines of the
motor encoder and the reduction ratio. For example,if the number of lines of the motor
encoder is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to 16384*6 = 98304 pulses.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xA8 0x00 0xF4 0x01 0x60 0x73 0xFF 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA8 0x00 0xF4 0x01 0x60 0x73 0xFF 0xFF CRC16L CRC16H

```

Description:

Data[2] and Data[3] form one (Data[2] is the low bit,Data[3] is the high bit) 16-bit data
is 0x01F4,which means the decimal 500dps motor output shaft speed. The drive will run
the position loop at this speed as the maximum speed. Data[4] to data[7] form one
(Data[4] is the lowest bit,Data[7] is the highest bit) 32-bit data is 0xFFFF7360,which
means -36000 in decimal. The sending command is reduced by 100 times according to
0.01degree/LSB,ie -36000\*0.01=-360°. The motor will move -360° in the opposite
direction relative to the current position with the output shaft.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xA8 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xA8 0x32 0x9C 0xFF 0x0C 0xFE 0xD3 0xFF CRC16L CRC16H

```

Description:

Data[1] = 0x32 is 50 in decimal,which means the motor temperature is 50 degrees at the
moment. The composite data of Data[2] and Data[3] 0xFF9C is -100 in decimal,and it is
-100*0.01=-1A when scaled down by 100 times,which means that the actual current of
the current motor is -1A. The composite data 0xFE0C of Data[4] and Data[5] is -500 in
decimal,which means the motor output shaft speed is -500dps. There is a reduction ratio
relationship between the motor output shaft speed and the motor speed. If the reduction
ratio is 6,then the motor speed is 6 times higher than the output shaft speed. The
composite data of Data[6] and Data[7] 0xFFD3 is -45 in decimal,which means that the
motor output shaft moves in the opposite direction by -45 degrees relative to the zero
position. The position of the motor output shaft is related to the number of lines of the
motor encoder and the reduction ratio. For example,if the number of lines of the motor
encoder is 16384 and the reduction ratio is 6,then 360 degrees of the motor output shaft
corresponds to 16384*6 = 98304 pulses.

### 2.24. System Operating Mode Acquisition (0x70)

#### 2.24.1. Instruction Description

This command reads the current motor running mode.

#### 2.24.2. Send Data Field Definition

```

Data field Description Data
DATA[0] Command byte 0x70
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.24.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the drive reply data
contains the running state of the parameter runmode,which is of type uint8_t.
The motor operation mode has the following 3 states:

## 1. Current loop mode (0x01);

## 2. Speed loop mode (0x02);

## 3. Position loop mode (0x03).

```

Data field Description Data
DATA[0] Command byte 0x70
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] Motor operating mode DATA[7] = (uint8_t)(runmode)

```

#### 2.24.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x70 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x70 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

This command reads the current motor running mode.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]

0x241 0x70 0x00 0x00 0x00 0x00 0x00 0x00 0x03

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x70 0x00 0x00 0x00 0x00 0x00 0x00 0x03 CRC16L CRC16H

```

Description:

Data[7] = 0x03,according to the definition of the reply frame,it means that the current
system is in the position loop mode.

### 2.25. System Reset Command (0x76)

#### 2.25.1. Instruction Description

This command is used to reset the system program.

#### 2.25.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x76
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.25.3. Reply Data Field Definition

The motor will reset after receiving the command and will not return to the command.

#### 2.25.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x76 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x76 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

After sending the command,the system is reset and the program runs again.

### 2.26. System Brake Release Command (0x77)

#### 2.26.1. Instruction Description

This command is used to open the system brake. The system will release the holding
brake,and the motor will be in a movable state without being restricted by the holding
brake.

#### 2.26.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x77
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.26.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data is the
same as the command sent by the host.

### 2.27. System Brake Lock Command (0x78)

#### 2.27.1. Instruction Description

This command is used to close the system holding brake. The holding brake locks the
motor and the motor can no longer run. The holding brake is also in this state after the
system is powered off.

#### 2.27.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x78
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.27.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data is the
same as the command sent by the host.

### 2.28. System Runtime Read Command (0xB1)

#### 2.28.1. Instruction Description

This command is used to obtain the system running time in ms.

#### 2.28.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB1
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.28.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the drive reply data
contains the system running time SysRunTime,which is uint32_t type,and the unit is ms.

```

Data field Description Data

DATA[0] Command byte 0xB1
DATA[0] NULL 0x00
DATA[0] NULL 0x00
DATA[0] NULL 0x00
DATA[4] SysRunTime low byte 1 DATA[4] = (uint8_t)(SysRunTime)
DATA[5] SysRunTime byte 2 DATA[5] = (uint8_t)(SysRunTime>>8)
DATA[6] SysRunTime byte 3 DATA[6] = (uint8_t)(SysRunTime>>16)
DATA[7] SysRunTime byte 4 DATA[7] = (uint8_t)(SysRunTime>>24)

```

#### 2.28.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB1 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB1 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

This command reads the running time of the current system.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xB1 0x00 0x00 0x00 0x00 0x00 0x00 0x10

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB1 0x00 0x00 0x00 0x00 0x00 0x00 0x10 CRC16L CRC16H

```

Description:

Data[4] to Data[7] (Data[4] is low and Data[7] is high) = 0x10000000,decimal
268435456,indicating that the system has run for 268435456ms after restarting or
resetting,about 74 hour.

### 2.29. System Software Version Date Read Command (0xB2)

#### 2.29.1. Instruction Description

This command is used to get the update date of the system software version.

#### 2.29.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB2
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.29.3. Reply Data Field Definition

The motor will reply to the host after receiving the command. The driver reply data
contains the latest version date of the system software,VersionDate,which is of type
uint32_t. The date format is in the format of year,month,and day,such as 20211126.

```

Data field Description Data

DATA[0] Command byte 0xB2
DATA[0] NULL 0x00
DATA[0] NULL 0x00
DATA[0] NULL 0x00
DATA[4] VersionDate low byte 1 DATA[4] = (uint8_t)(&VersionDate)
DATA[5] VersionDate byte 2 DATA[5] = (uint8_t)(VersionDate>>8)
DATA[6] VersionDate byte 3 DATA[6] = (uint8_t)(VersionDate>>16)
DATA[7] VersionDate byte 4 DATA[7] = (uint8_t)(VersionDate>>24)

```

#### 2.29.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB2 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB2 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

This command reads the current software version date.

Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xB2 0x00 0x00 0x00 0x2E 0x89 0x34 0x01

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB2 0x00 0x00 0x00 0x2E 0x89 0x34 0x01 CRC16L CRC16H

```

Description:

Data[4] to Data[7] (Data[4] is low and Data[7] is high) = 0x0134892E,decimal
20220206,indicating that the software version date is February 6,2022.

### 2.30. Communication Interruption Protection Time Setting

          Command (0xB3)

#### 2.30.1. Instruction Description

This command is used to set the communication interruption protection time in ms. If
the communication is interrupted for more than the set time,it will cut off the output
brake lock. To run again,you need to establish stable and continuous communication
first. Writing 0 means that the communication interruption protection function is not
enabled.

#### 2.30.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB3
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] CanRecvTime_MS low byte1 DATA[4] = (uint8_t)(CanRecvTime_MS)

DATA[5] CanRecvTime_MS byte2 DATA[5]=(uint8_t)(CanRecvTime_MS>>8)
DATA[6] CanRecvTime_MS byte3 DATA[6]=(uint8_t)(CanRecvTime_MS>>16)
DATA[7] CanRecvTime_MS byte4 DATA[7]=(uint8_t)(CanRecvTime_MS>>24)

```

#### 2.30.3. Reply Data Field Definition

The motor replies to the host after receiving the command,and the frame data is the
same as the command sent by the host.

#### 2.30.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB3 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB3 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Note: The data values are all 0,which means that the communication interruption

protection function is not enabled. If the communication is interrupted,the motor will
continue to execute the current command.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xB3 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB3 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description:

The frame data is the same as the command sent by the host.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB3 0x00 0x00 0x00 0xE8 0x03 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB3 0x00 0x00 0x00 0xE8 0x03 0x00 0x00 CRC16L CRC16H

```

Description:

Data[4] to Data[7] (Data[4] is low and Data[7] is high) constitute data
0x000003E8,decimal is 1000ms. It indicates that the communication interruption
protection time is set to 1000ms,which is stored in the ROM and saved after power
failure. Then,if the communication interval exceeds 1000ms,the communication
interruption protection will be triggered,and the output lock brake will be cut off. When
the communication interval is restored to within 1000ms,normal operation can be
resumed.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xB3 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB3 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: The frame data is the same as the command sent by the host.

### 2.31. Communication Baud Rate Setting Command (0xB4)

#### 2.31.1. Instruction Description

This instruction can set the communication baud rate of CAN and RS485 bus. The
parameters will be saved in ROM after setting,and will be saved after power off,and will
run at the modified baud rate when powered on again.
Baud rate:
RS485: 0 stands for 115200bps baud rate, ## 1. stands for 500Kbps baud rate, ## 2. stands for 1Mbps baud rate, ## 3. stands for 1.5Mbps baud rate, ## 4. stands for 2.5Mbps baud rate;
CAN: 0 stands for 500Kbps baud rate, ## 1. stands for 1Mbps baud rate.

#### 2.31.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB4
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] Baud rate DATA[7] = (uint8_t)baudrate

```

#### 2.31.3. Reply Data Field Definition

Since the communication baud rate is modified,the reply command is random and need
not be processed.

#### 2.31.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]

0x141 0xB4 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB4 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: Data[7] = 0,which means the baud rate of RS485 is changed to

115200bps,and the baud rate of CAN is changed to 500Kbps.
Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB4 0x00 0x00 0x00 0x00 0x00 0x00 0x01

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB4 0x00 0x00 0x00 0x00 0x00 0x00 0x01 CRC16L CRC16H

```

Description: Data[7] = 1,which means the RS485 baud rate is changed to 500Kbps,and

the CAN baud rate is changed to 1Mbps.
Example 3:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB4 0x00 0x00 0x00 0x00 0x00 0x00 0x02

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB4 0x00 0x00 0x00 0x00 0x00 0x00 0x02 CRC16L CRC16H

```

Description: Data[7] = 2,which means the RS485 baud rate is changed to 1Mbps,and

CAN is invalid.

### 2.32. Motor Model Reading Command (0xB5)

#### 2.32.1. Instruction Description

This command is used to read the motor model,and the read data is ACSII code,which
can be converted into the corresponding actual symbol by checking the ACSII code
table.

#### 2.32.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB5
DATA[1] NULL 0x00
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] NULL 0x00

```

#### 2.32.3. Reply Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB5
DATA[1] Motor model 1 Type1(ACSII)
DATA[2] Motor model 2 Type2(ACSII)
DATA[3] Motor model 3 Type3(ACSII)
DATA[4] Motor model 4 Type4(ACSII)
DATA[5] Motor model 5 Type5(ACSII)
DATA[6] Motor model 6 Type6(ACSII)
DATA[7] Motor model 7 Type7(ACSII)

```

#### 2.32.4. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB5 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB5 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: Send the command to read the motor model.

Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0xB5 0x58 0x38 0x53 0x32 0x56 0x31 0x30

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0xB5 0x58 0x38 0x53 0x32 0x56 0x31 0x30 CRC16L CRC16H

```

Description: This command replies with 7 ACSII codes,and the 7 characters

corresponding to the motor model are obtained by looking up the table: RMD-X8 S2
V10.

### 2.33. Active Reply Function Command (0xB6)

#### 2.33.1. Instruction Description

This command is used to select the specified command to actively reply at a fixed
time,and more than 1 command can be specified,and different commands will be
cyclically and alternately replied according to the set time. If an active reply command
is set,the motor will not reply after receiving the command. Only valid for CAN
version,485 version does not support this function.

#### 2.33.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0xB6

```

             Specify the command for Reply commands include：0x60、0x61、

DATA[1]
proactive response 0x62、0x92、0x9A、0x9C、0x9D、0x9E；
0：Turn off the active reply function of this
command；
DATA[2] Unsolicited reply enable bit
1：Enable the active reply function of this
command：
The lower 8 bits of the reply
DATA[3] Reply interval time,unit 10ms. Alternate
interval parameter
loop reply when replying multiple
The high 8 bits of the reply
DATA[4] commands.
interval parameter

DATA[5] NULL NULL
DATA[6] NULL NULL
DATA[7] NULL NULL

#### 2.33.3. Reply Data Field Definition

After enabling it,the data will not be returned,and the motor will actively reply to the
selected command content according to the set time interval.

#### 2.33.4. Example of Communication

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0xB6 0x60 0x01 0x01 0x00 0x00 0x00 0x00

```

Description: Enable 0x60 active reply command,the time interval is 20ms. After

sending this command,the motor will not reply when receiving the command,but will
reply 0x60 command at intervals of 10ms.

### 2.34. Function Control Command (0x20)

#### 2.34.1. Instruction Description

This instruction is used to use some specific functions. It is a compound function
instruction,which can contain multiple function control instructions.Be careful to avoid
writing parameters when the motor has just started and is in motion.

#### 2.34.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x20
DATA[1] Function index DATA[1] = (uint8_t)index
DATA[2] NULL 0x00
DATA[3] NULL 0x00
DATA[4] Input parameter low byte 1 DATA[4] = (uint8_t)(Value)
DATA[5] Input parameter byte 2 DATA[5] = (uint8_t)(Value>>8)
DATA[6] Input parameter byte 3 DATA[6] = (uint8_t)(Value>>16)
DATA[7] Input parameter byte 4 DATA[7] = (uint8_t)(Value>>24)

```

#### 2.34.3. Reply Data Field Definition

The motor replies to the host computer after receiving the command,and the frame data
is the same as the command sent by the host computer.

#### 2.34.4. Function Index Description

```

Index value Command name Function description
Clear multi-turn Clear motor multi-turn value,update zero point

```

0x01
value and save. It will take effect after restarting.
CANID filter The value "1" means that the CANID filter is

0x02 enable enabled,which can improve the efficiency of
motor sending and receiving in CAN
communication;
The value "0" means the disabled CANID
filter,which needs to be disabled when the
multi-motor control command 0x280,0x300 is
required;
This value will be saved in FLASH,and the
written value will be recorded after power off.
Error status The value "1" means that this function is
transmission enabled. After the motor appears in an error
enable state,it actively sends the status command 0x9A
0x03
to the bus with a sending cycle of 100ms. Stop
sending after the error status disappears;
The value "0" means the function is disabled.
The multi-turn The value "1" means that this function is
value is saved enabled,and the motor will save the current
when the power is multi-turn value before powering off;

0x04 off. The value "0" means that this function is
disabled; at this time,the system defaults to
single lap mode; it will take effect after
restarting.
Set CANID The value means the CANID number that is

0x05 going to be modified, which will be saved to
ROM and take effect after a reboot.
Set the maximum The value represents the maximum positive
positive angle for angle value for the position operation mode,

0x06 the position which is set and saved to ROM to take effect
operation mode immediately.

                     Set the maximum            The value represents the maximum negative
                     negative angle for         angle value for the position operation mode,

0x07 the position which is set and saved to ROM to take effect
operation mode immediately.

#### 2.34.5. Communication Example

Example 1:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x20 0x01 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x20 0x01 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: Data[1] = 0x01,according to the index value table,the representative

function is to clear the multi-turn value.
Reply command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x20 0x01 0x00 0x00 0x00 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x20 0x01 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

```

Description: The frame data is the same as the command sent by the host.

Example 2:

Send command:

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x141 0x20 0x02 0x00 0x00 0x01 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x20 0x02 0x00 0x00 0x01 0x00 0x00 0x00 CRC16L CRC16H

```

Description: Data[1] = 0x01,according to the index value table,the representative

function is to enable the CANID filter. Note that the 0x280 multi-motor command
cannot be used after enabling,and the CANID filter needs to be disabled before using
the 0x280 command again.
Reply command :

```

CAN:
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x20 0x02 0x00 0x00 0x01 0x00 0x00 0x00

```

```

RS485：
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x20 0x02 0x00 0x00 0x01 0x00 0x00 0x00 CRC16L CRC16H

```

Description: The frame data is the same as the command sent by the host computer.

## 3. CAN Multi-Motor Command (0x280 + Command)

### 3.1. Instruction Description

The ID number is 280,which means that multiple motors correspond to the same
command at the same time. The content and function of the instruction are the same as
those of the single-motor instruction.

### 3.2. Communication Example

Suppose there are 4 motors on the CAN bus,and the ID numbers are 141,142,143,and

## 144. respectively.

Example 1:

Send command:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x280 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00
Description:

## 4. motors receive the 0x80 motor shutdown command at the same time (see 2.30 for

details),and then all 4 motors immediately execute the motor shutdown command.
Reply command:

## 4. motors reply at the same time,and the reply ID is their own ID number respectively.

The reply sequence depends on the respective delays on the bus.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00

Description:

The motor whose ID number is 0x241 returns the corresponding command.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x242 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00
Description:

The motor whose ID number is 0x242 returns the corresponding command.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x243 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00
Description:

The motor whose ID number is 0x243 returns the corresponding command.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x244 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00
Description:

The motor whose ID number is 0x244 returns the corresponding command.
Example 2:

Send command:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x280 0x60 0x00 0x00 0x00 0x00 0x00 0x00 0x00

Description:

## 4. motors receive the 0x60 read multi-turn encoder position data command at the same

time (see 2.21 for details),and then the 4 motors reply to their respective multi-turn
encoder position data.
Reply command:

## 4. motors reply at the same time,and the reply ID is their own ID number respectively.

The reply sequence depends on the respective delays on the bus.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x241 0x60 0x00 0x00 0x00 0x10 0x27 0x00 0x00
Description:

The motor reply data with ID number 0x241 consists of Data[4] to data[7] (Data[4] is the
lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00002710,which means the
decimal is 10000. The multi-turn encoder value representing the current relative
multi-turn zero offset (initial position) of the motor is 10000 pulses.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x242 0x60 0x00 0x00 0x00 0x20 0x4E 0x00 0x00
Description:

The motor reply data with ID number 0x242 consists of Data[4] to data[7] (Data[4] is
the lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00004E20,which means

## 20000. in decimal. The multi-turn encoder value representing the current relative

multi-turn zero offset (initial position) of the motor is 20000 pulses.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x243 0x60 0x00 0x00 0x00 0x30 0x75 0x00 0x00
Description:

The motor reply data with ID number 0x243 consists of Data[4] to data[7] (Data[4] is

the lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00007530,which means

## 30000. in decimal. The multi-turn encoder value representing the current relative

multi-turn zero offset (initial position) of the motor is 30000 pulses.
ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x244 0x60 0x00 0x00 0x00 0x40 0x9C 0x00 0x00
Description:

The motor reply data with ID number 0x243 consists of Data[4] to data[7] (Data[4] is
the lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00007530,which means

## 30000. in decimal. The multi-turn encoder value representing the current relative

multi-turn zero offset (initial position) of the motor is 30000 pulses.

## 4. CANID Setting Command (0x79)

### 4.1. Instruction Description

This command is used to set and read CANID. The host sends this command to set and
read the CAN ID,the parameters are as follows.

## 1. The read and write flag bit wReadWriteFlag is bool type,1 read 0 write;

## 2. CANID,size range (#1~#32),uint16_t type (synchronized with the upper computer

function),device identifier 0x140 + ID (1~32).

### 4.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x79
DATA[1] NULL 0x00
DATA[2] Read and write flags DATA[2] = wReadWriteFlag
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] CANID DATA[7] = CANID(1~32)

```

### 4.3. Reply Data Field Definition

The motor replies to the host after receiving the command,which is divided into the
following two situations:

## 1. Set CANID,the range is 1-32,and return to the original command.

## 2. Read CANID,the return parameters are as follows.

```

Data field Description Data

DATA[0] Command byte 0x79
DATA[0] NULL 0x00
DATA[0] Read and write flags DATA[2] = wReadWriteFlag
DATA[0] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] CANID low byte 1 DATA[6] = (uint8_t \*)(CANID)
DATA[7] CANID byte 2 DATA[7] = (uint8_t)(CANID>>8)

```

### 4.4. Communication Example

Example 1:

Send command:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x300 0x79 0x00 0x00 0x00 0x00 0x00 0x00 0x02
Description:

Data[2] = 0 means write CANID. Data[7] = 1 means that the motor CANID is set to
2,that is,the send ID is 0x142,and the reply ID is 0x242.
Reply command:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x300 0x79 0x00 0x00 0x00 0x00 0x00 0x00 0x02
Description:

Same as sending command.
Example 2:

Send command:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x300 0x79 0x00 0x01 0x00 0x00 0x00 0x00 0x00
Description:

Data[2] = 1 means reading CANID.
Reply command:

ID Data[0] Data[1] Data[2] Data[3] Data[4] Data[5] Data[6] Data[7]
0x300 0x79 0x00 0x01 0x00 0x00 0x00 0x42 0x02
Description:

Data[6] and Data[7] form 0x242,which means that the motor send ID is 0x142,and the
reply ID is 0x242.

## 5. Motion Mode Control Command_CAN (0x400 + ID)

### 5.1. Instruction Description

The command consists of 5 input parameters: p_des (desired position),v_des(desired
velocity),t_ff (feedforward torque),kp (position deviation coefficient),kd (speed
deviation coefficient).
Each parameter has a preset range size:
p_des: -12.5 to 12.5 in rad;
v_des: -45 to 45,in rad/s;
t_ff: -24 to 24,unit N-m;
kp: 0 to 500;
kd: 0 to 5;
Function expression:
IqRef = [kp*(p_des - p_fd_actual position) + kd*(v_des - v_fb_actual speed) +
t_ff]\*KT_torque coefficient;

IqRef is the output current of the last given motor.

### 5.2. Send Data Field Definition

                 Data           Data

```

Data field Data definition Data range
partition combination

```

              0-3bit

DATA[0] p_des[8-15] p_des Upper 8-bit data
4-7bit
16-bit range
0-3bit
DATA[1] p_des[0-7] p_des Lower 8-bit data
4-7bit
0-3bit
DATA[2] v_des[4-11] v_des Upper 8-bit data
4-7bit 12-bit range

              0-3bit       v_des[0-3]             v_des Lower 8-bit data

DATA[3]
4-7bit kp[8-11] kp Upper 4-bit data

              0-3bit                                                         12-bit range

DATA[4] kp[0-7] kp Lower 8-bit data
4-7bit
0-3bit
DATA[5] kd[4-11] kd Upper 8-bit data
4-7bit 12-bit range

              0-3bit       kd[0-3]                   kd Lower 4-bit data

DATA[6]
4-7bit t_ff[8-11] t_ff Upper 4-bit data

              0-3bit                                                         12-bit range

DATA[7] t_ff[0-7] t_ff Lower 8-bit data
4-7bit

### 5.3. Reply Data Field Definition

                 Data           Data

```

Data field Data definition Data range
partition combination

DATA[0] 0-7bit CANID[0-7] Device CAN address number 8-bit range

```

              0-3bit

DATA[1] p_des[8-15] p_des Upper 8-bit data
4-7bit 16-bit range

DATA[2] 0-3bit p_des[0-7] p_des Lower 8-bit data

           4-7bit
           0-3bit

DATA[3] v_des[4-11] v_des Upper 8-bit data
4-7bit 12-bit range

           0-3bit            v_des[0-3]                v_des Lower 4-bit data

DATA[4]
4-7bit t_ff[8-11] t_ff Upper 4-bit data

           0-3bit                                                                           12-bit range

DATA[5] t_ff[0-7] t_ff Lower 8-bit data
4-7bit
0-3bit
DATA[6] NULL NULL
4-7bit NULL

           0-3bit            NULL                                  NULL

DATA[7]
4-7bit NULL NULL NULL

### 5.4. Communication Example

Example 1:

Send command: ID number 0x401

Data Data Data Data calculation
Data Data range
field partition definition instructions

                    0-3bit    0xE        p_des value

DATA[0] 0xE6 p_des=(58982/65536
4-7bit 0x6 is 0xE666 (-)12.5rad~12.5ra
)\*25+(-12.5)=9.99ra
0-3bit 0x6 decimal is d total 25rad
DATA[1] 0x66 d
4-7bit 0x6 (58982)

                    0-3bit    0x8        v_des value

DATA[2] 0x82 (-)45rad/s~4
4-7bit 0x2 is 0x82E v_des=(2094/4095)\*
5rad/s
decimal is 90+(-45)=1.021 rad/s
0-3bit 0xE total 90rad/s
DATA[3] 0xE0 (2094)

                    4-7bit    0x0        kp value is

                    0-3bit    0x5        0x52             0~500                   kp=(82/4095)*500+0

DATA[4] 0x52 decimal is total 500 =10.012
4-7bit 0x2
(82)
0-3bit 0x3 kd value is
DATA[5] 0x33
4-7bit 0x3 0x333 0~5 kd=(819/4095)\*5+0=
decimal is total 5 1
0x3 0-3bit 0x3
DATA[6] (819)
B
4-7bit 0xB t_ff value is

                    0-3bit   0x5   0xB55             (-)24N-m~24N-m t_ff=(2901/4095)*48

DATA[7] 0x55 decimal is totol 48N-m +(-24)=10.004 N-m
4-7bit 0x5
(2901)
Reply command: ID No. 0x501

                        Data           Data                                  Data calculation

Data field Data Data range
partition definition instructions
Device address ID
DATA[0] 0x01 0-7bit 0x1 CANID 0-32
number

                    0-3bit   0xE   p_des value is

DATA[1] 0xE6 p_des=(58982/65536
4-7bit 0x6 0xE666 (-)12.5rad~12.5
)\*25 + (-12.5)= 9.99
0-3bit 0x6 decimal is rad total 25rad
DATA[2] 0x65 rad
4-7bit 0x6 (58982)

                    0-3bit   0x8   v_des value is

DATA[3] 0x82 (-)45rad/s~4
4-7bit 0x2 0x82E v_des=(2094/4095)*
5rad/s
decimal is 90+(-45)=1.021rad/s
0xE 0-3bit 0xE total 90rad/s
DATA[4] (2094)
B
4-7bit 0xB t_ff value is (-)24N-m~24N
0-3bit 0x5 0xB55 -m t_ff=(2901/4095)*48
DATA[5] 0x55 decimal is total 48N-m + (-24)= 10.004 N-m
4-7bit 0x5
(2901)

                             NU
                    0-3bit         NULL                NULL              NULL
                             LL

DATA[6]
NU
4-7bit NULL NULL NULL
LL
NU
0-3bit NULL NULL NULL
LL
DATA[7]
NU
4-7bit NULL NULL NULL
LL

## 6. RS485 Multi-Motor Command (0xCD + Command)

### 6.1. Instruction Description

The ID number is 0xCD,which means that multiple motors correspond to the same
command at the same time. The content and function of the instruction are the same as
those of the single-motor instruction. For details,please refer to the single-motor
instruction.

### 6.2. Communication Example

Suppose there are 4 motors on the RS485 bus,and the ID numbers are 01,02,03,04
respectively.
Example 1:

Send command:

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0xCD 0x08 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description:

## 4. motors receive the 0x80 motor shutdown command at the same time (see 2.30 for

details),and then all 4 motors immediately execute the motor shutdown command.
Reply command:

## 4. motors reply at the same time,and the reply ID is their own ID number respectively.

The reply sequence depends on the respective delays on the bus.
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description: The motor whose ID number is 0x01 returns the corresponding command.

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x02 0x08 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description: The motor whose ID number is 0x02 returns the corresponding command.

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x03 0x08 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description: The motor whose ID number is 0x03 returns the corresponding command.

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x04 0x08 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description: The motor whose ID number is 0x04 returns the corresponding command.

Example 2:

Send command:

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0xCD 0x08 0x60 0x00 0x00 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description:

## 4. motors receive the 0x60 read multi-turn encoder position data command at the same

time (see 2.21 for details),and then the 4 motors reply to their respective multi-turn
encoder position data.
Reply command:

## 4. motors reply at the same time,and the reply ID is their own ID number respectively.

The reply sequence depends on the respective delays on the bus.
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x01 0x08 0x60 0x00 0x00 0x00 0x10 0x27 0x00 0x00 CRC16L CRC16H

Description:

The motor reply data with ID number 0x01 consists of Data[4] to data[7] (Data[4] is the
lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00002710,which means the
decimal is 10000. The multi-turn encoder value representing the current relative
multi-turn zero offset (initial position) of the motor is 10000 pulses.
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x02 0x08 0x60 0x00 0x00 0x00 0x20 0x4E 0x00 0x00 CRC16L CRC16H

Description:

The motor reply data with ID number 0x02 consists of Data[4] to data[7] (Data[4] is the
lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00004E20,which means

## 20000. in decimal. The multi-turn encoder value representing the current relative

multi-turn zero offset (initial position) of the motor is 20000 pulses.
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x03 0x08 0x60 0x00 0x00 0x00 0x30 0x75 0x00 0x00 CRC16L CRC16H

Description:

The motor reply data with ID number 0x03 consists of Data[4] to data[7] (Data[4] is the
lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00007530,which means 30000
in decimal. The multi-turn encoder value representing the current relative multi-turn
zero offset (initial position) of the motor is 30000 pulses.
Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0x04 0x08 0x60 0x00 0x00 0x00 0x40 0x9C 0x00 0x00 CRC16L CRC16H

Description:

The motor reply data with ID number 0x04 consists of Data[4] to data[7] (Data[4] is the
lowest bit,Data[7] is the highest bit). The 32-bit data is 0x00009C40,which means

## 40000. in decimal. The multi-turn encoder value representing the current relative

multi-turn zero offset (initial position) of the motor is 40000 pulses.

## 7. RS485-ID Setting Command (0x79)

### 7.1. Instruction Description

This command is used to set and read RS485 ID. Communication ID uses 0xCD,all
devices on the bus will receive and process this command. When modifying,you need to
pay attention to whether multiple devices are connected,so that the IDs of multiple
devices may be modified to the same at the same time.
The host sends this command to set and read the RS485 ID,the parameters are as
follows.

## 1. The read and write flag bit wReadWriteFlag is bool type,1 read 0 write;

## 2. RS485-ID,size range (#1~#32),uint16_t type (synchronized with the upper computer

function),device identifier ID (1~32).

### 7.2. Send Data Field Definition

```

Data field Description Data

DATA[0] Command byte 0x79
DATA[1] NULL 0x00
DATA[2] Read and write flags DATA[2] = wReadWriteFlag
DATA[3] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] NULL 0x00
DATA[7] RS485ID DATA[7] = RS485ID(1~32)

```

### 7.3. Reply Data Field Definition

The motor replies to the host after receiving the command,which is divided into the
following two situations:

## 1. Set RS485ID,the range is 1-32,and return to the original command;

## 2. Read RS485ID,the return parameters are as follows.

```

Data field Description Data
DATA[0] Command byte 0x79
DATA[0] NULL 0x00
DATA[0] Read and write flags DATA[2] = wReadWriteFlag
DATA[0] NULL 0x00
DATA[4] NULL 0x00
DATA[5] NULL 0x00
DATA[6] RS485ID low byte 1 DATA[6] = (uint8_t \*)(RS485ID)
DATA[7] RS485ID byte 2 DATA[7] = (uint8_t)(RS485ID>>8)

```

### 7.4. Communication Example

Example 1:

Send command:

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0xCD 0x08 0x79 0x00 0x00 0x00 0x00 0x00 0x00 0x02 CRC16L CRC16H

Description: Data[2] = 0 means write RS485ID. Data[7] = 1 means to set the motor

RS485ID to 2.
Reply command:

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0xCD 0x08 0x79 0x00 0x00 0x00 0x00 0x00 0x00 0x02 CRC16L CRC16H

Description: Same as sending command.

Example 2:

Send command:

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0xCD 0x08 0x79 0x00 0x01 0x00 0x00 0x00 0x00 0x00 CRC16L CRC16H

Description: Data[2] = 1 means to read RS485ID.

Reply command:

Frame
ID Length D0 D1 D2 D3 D4 D5 D6 D7 CRC16L CRC16H
header

0x3E 0xCD 0x08 0x79 0x00 0x01 0x00 0x00 0x00 0x00 0x02 CRC16L CRC16H

Description: Data[7] = 0x2 means that the sending ID of the motor is 0x2 and the reply

ID is 0x2.

## 8. Indicator Light Description

### 8.1. Status Description

- When the indicator light is solid on,it means the motor is running normally;
- Slow flashing indicates that the motor has a secondary error. If the recovery condition
  is reached,it will automatically return to normal operation,and the indicator light will be
  solid on for a long time;
- Flickering quickly indicates that the motor has a first-level error,and the motor cannot
  recover from the error. It is necessary to check the motor fault and restart before it can
  continue to run.

### 8.2. Failure Description Form

Fault Name Description Error Level
Hardware If the motor current exceeds the limit value,there may
over-current be short circuit,phase loss,loss of control,motor Level 1
damage,etc.
Stall error After the current reaches the stall current,the speed is
very low and continues for a period of time. It Level 1
indicates that the motor load is too large.
Under-voltage The power input is lower than the set undervoltage
Level 2
error value
Over-voltage The power input is higher than the set overvoltage
Level 2
error value
Phase-current The software detects that the motor current exceeds Level 1
over-current the limit value,and there may be short circuit,phase
loss,loss of control,motor damage,etc.
Power overrun If the input current of the power supply exceeds the
error limit value,there may be a situation where the load is Level 2
too large or the speed is too high.
Calibration Failed to write parameters causing parameter loss.
parameter read Level 1
error
Over-speed The motor running speed exceeds the limit value,there
Level 2
error may be over pressure and drag use.
Motor If the motor temperature exceeds the set value,there
over-temperatu may be short circuit,parameter error,and long-term Level 2
re error overload use.
Encoder The encoder calibration result deviates too much from
calibration the standard value. Level 2
error

## 9. Version Revision Information

Version V3.1:

1. Version revision content:
   a.Revise the definition of reply data in 5.0 operation control command.
2. Version revision date: 2022.6.23
   Version V3.2:
3. Version revision content:
   a.Add the description of indicator lights.
4. Version revision date: 2022.7.27
   Version V3.3:
5. Version revision content:
   a.Add function control command 0x20 a function: add CAN filter disable control
   function.
6. Version revision date: 2022.7.31
   Version V3.4:
7. Version revision content:
   a.Add position tracking instruction 0xA3;
   b.In the 0x43 command,add the settings of 4 values of acceleration and deceleration for
   position planning and speed planning.
8. Version revision date: 2022.8.17
   Version V3.5:
9. Version revision content:
   a.Increase the position tracking command 0xA5 with speed limit;
   b.Add function control command 0x20: error status sending and multi-turn value
   power-down save selection function;
   c.Add the 0xB5 command to read the motor model.
10. Version revision date: 2022.9.05
    Version V3.6：
11. Version revision content：
    a.Increase RS485 broadcast instruction description 0xCD.
12. Version revision date:2022.10.13
    Version V3.7:
13. Version revision content:
    a.Remove the A3 instruction;
    b.Merge A5 into A4;
    c.Add A6 single-turn position command;
    d.Add the command 0x90 to read the single-turn encoder;
    e.Add the command 0x94 to read the single-turn angle of the motor.
    2)Version revision date:2022.11.26
    Version V3.8:
    1)Version revision content:
    a.The RS485 protocol baud rate of 2Mbps is modified to 2.5Mbps.
    2)Version revision date:2022.11.26
    Version V3.9:
    1)Version revision content:
    a.Add 485 serial port configuration instructions;
    b.Add the function index in the 0x42 command,and you can read the acceleration and
    deceleration values of position and speed through the index;
    c.Add 0xB6 active reply function.
    2)Version revision date:2023.3.11
    Version V4.0:
    1)Version revision content:
    a.Add the function of setting CANID in the 0x20 command;
    b.Add the maximum positive angle limit value in the 0x20 command;
    c.Add the maximum negative angle limit value in the 0x20 command.
    2)Version revision date: 2023.10.16

Version V4.1:

1. Version revision content:
   a.Modify the circleAngle of the motor to be the uint16_t type data.
   2)Version revision date: 2024.2.13

Version V4.2:

1. Version revision content:
   a.Modify the Read PID Parameters command (0x30) to read the PID parameters of the
   current,speed,and position loops using the index;
   b.Modify the Write PID Parameters to RAM command (0x31),and use the index to
   write the PID parameters of the current loop,velocity loop,and position loop to RAM;
   c.Modify the Write PID Parameters to ROM command (0x32),use the index to write the
   PID parameters of the current loop,speed loop and position loop to ROM.
   2)Version revision date: 2024.5.28
```
