export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: '❌ Method not allowed' 
    });
  }

  try {
    const { number } = req.query;

    if (!number) {
      return res.status(400).json({
        success: false,
        message: '📱 Mobile number is required. Usage: /api/fetchdata?number=MOBILE_NUMBER'
      });
    }

    // Validate mobile number format
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(number)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid mobile number format. Please provide a valid 10-digit Indian mobile number.'
      });
    }

    console.log(`🔍 Searching for mobile: ${number}`);

    // Step 1: Get mobile information from first API
    const mobileData = await fetchMobileData(number);
    
    if (!mobileData.success) {
      console.log(`❌ Mobile data not found for: ${number}`);
      return res.status(200).json({
        success: false,
        message: '📭 No information found for this mobile number. Please check the number and try again.'
      });
    }

    console.log(`✅ Found ${mobileData.users.length} user(s) for mobile: ${number}`);

    // Step 2: Get family information from second API
    const familyData = await fetchFamilyData(mobileData.users);
    
    if (!familyData.success) {
      console.log(`❌ Family data not found for mobile: ${number}`);
      return res.status(200).json({
        success: false,
        message: '👨‍👩‍👧‍👦 Family data not found for this mobile number.'
      });
    }

    console.log(`🎉 Successfully found family data for mobile: ${number}`);

    // Get Indian Standard Time
    const indianTime = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    // Format relationship names properly
    const formatRelationship = (relationship) => {
      const relationshipMap = {
        'SELF': 'Self',
        'HUSBAND': 'Husband',
        'WIFE': 'Wife',
        'SON': 'Son',
        'DAUGHTER': 'Daughter',
        'FATHER': 'Father',
        'MOTHER': 'Mother',
        'BROTHER': 'Brother',
        'SISTER': 'Sister',
        'GRANDFATHER': 'Grandfather',
        'GRANDMOTHER': 'Grandmother'
      };
      return relationshipMap[relationship] || relationship;
    };

    // Get relationship emoji
    const getRelationshipEmoji = (relationship) => {
      const emojiMap = {
        'SELF': '👤',
        'HUSBAND': '👨',
        'WIFE': '👩',
        'SON': '👦',
        'DAUGHTER': '👧',
        'FATHER': '👴',
        'MOTHER': '👵',
        'BROTHER': '👨',
        'SISTER': '👩',
        'GRANDFATHER': '👴',
        'GRANDMOTHER': '👵'
      };
      return emojiMap[relationship] || '👤';
    };

    // Format address properly
    const formatAddress = (address) => {
      if (!address) return 'Not available';
      try {
        // Remove special characters and clean up address
        const cleanedAddress = address.replace(/[!*]/g, ',').replace(/,+/g, ',');
        return cleanedAddress.split(',').filter(part => part.trim() !== '').join(', ');
      } catch (error) {
        return address;
      }
    };

    // Extract state from address
    const extractState = (address) => {
      if (!address) return 'Not available';
      const states = [
        'UTTARAKHAND', 'UTTAR PRADESH', 'DELHI', 'MAHARASHTRA', 'KARNATAKA',
        'TAMIL NADU', 'KERALA', 'ANDHRA PRADESH', 'TELANGANA', 'WEST BENGAL',
        'RAJASTHAN', 'GUJARAT', 'MADHYA PRADESH', 'BIHAR', 'JHARKHAND',
        'ODISHA', 'PUNJAB', 'HARYANA', 'HIMACHAL PRADESH', 'ASSAM'
      ];
      
      for (const state of states) {
        if (address.toUpperCase().includes(state)) {
          return state.charAt(0) + state.slice(1).toLowerCase();
        }
      }
      return 'Not available';
    };

    // Prepare family members data
    const familyMembers = familyData.data.memberDetailsList.map(member => {
      const emoji = getRelationshipEmoji(member.releationship_name);
      const formattedRelationship = formatRelationship(member.releationship_name);
      
      return {
        name: `${emoji} ${member.memberName.trim()}`,
        original_name: member.memberName.trim(),
        relationship: `🔗 ${formattedRelationship}`,
        relationship_type: member.releationship_name,
        uid_status: member.uid === 'Yes' ? '✅ UID Verified' : '❌ UID Not Verified',
        is_verified: member.uid === 'Yes',
        member_id: member.memberId || 'Not available'
      };
    });

    // Sort family members: Self first, then by relationship priority
    const relationshipPriority = {
      'SELF': 1,
      'HUSBAND': 2,
      'WIFE': 3,
      'FATHER': 4,
      'MOTHER': 5,
      'SON': 6,
      'DAUGHTER': 7,
      'BROTHER': 8,
      'SISTER': 9
    };

    familyMembers.sort((a, b) => {
      const priorityA = relationshipPriority[a.relationship_type] || 10;
      const priorityB = relationshipPriority[b.relationship_type] || 10;
      return priorityA - priorityB;
    });

    // Prepare complete response
    const responseData = {
      success: true,
      message: "✅ Family information retrieved successfully",
      timestamp: indianTime,
      timezone: "IST (Indian Standard Time)",
      
      family_details: {
        title: "👨‍👩‍👧‍👦 Family Details",
        summary: `Family of ${familyMembers.find(m => m.relationship_type === 'SELF')?.original_name || 'Unknown'}`,
        data: {
          family_address: `📍 ${formatAddress(familyData.data.address)}`,
          original_address: familyData.data.address,
          district: `🏛️ ${familyData.data.homeDistName || extractDistrict(familyData.data.address)}`,
          state: `🗺️ ${familyData.data.homeStateName || extractState(familyData.data.address)}`,
          pincode: `📮 ${extractPincode(familyData.data.address)}`,
          scheme: `📋 ${familyData.data.schemeName || 'Not available'}`,
          total_family_members: `👥 ${familyData.data.memberDetailsList.length} members`,
          ration_card_id: `🆔 ${familyData.data.rcId || 'Not available'}`,
          family_id: `🏠 ${familyData.data.fpsId || 'Not available'}`
        }
      },

      family_members: {
        title: "👪 Family Members List",
        total_count: familyData.data.memberDetailsList.length,
        members: familyMembers,
        summary: {
          self_count: familyMembers.filter(m => m.relationship_type === 'SELF').length,
          male_count: familyMembers.filter(m => ['HUSBAND', 'FATHER', 'SON', 'BROTHER', 'GRANDFATHER'].includes(m.relationship_type)).length,
          female_count: familyMembers.filter(m => ['WIFE', 'MOTHER', 'DAUGHTER', 'SISTER', 'GRANDMOTHER'].includes(m.relationship_type)).length,
          children_count: familyMembers.filter(m => ['SON', 'DAUGHTER'].includes(m.relationship_type)).length,
          verified_count: familyMembers.filter(m => m.is_verified).length
        }
      },

      additional_info: {
        title: "📋 Additional Information",
        data: {
          scheme_details: {
            name: familyData.data.schemeName || 'Not available',
            id: familyData.data.schemeId || 'Not available',
            type: familyData.data.schemeName === 'PHH' ? 'Priority Household' : 'General'
          },
          location_info: {
            district_code: familyData.data.districtCode || 'Not available',
            state_code: familyData.data.homeStateCode || 'Not available',
            fps_code: familyData.data.fpsId || 'Not available'
          },
          verification_status: {
            duplicate_uid: familyData.data.dup_uid_status === 'Yes' ? '❌ Duplicate Found' : '✅ No Duplicate',
            onorc_allowed: familyData.data.allowed_onorc === 'Yes' ? '✅ Allowed' : '❌ Not Allowed'
          }
        }
      },

      search_summary: {
        title: "📊 Search Summary",
        data: {
          search_type: "Mobile Number to Family Info",
          total_family_members: `👪 ${familyData.data.memberDetailsList.length} members`,
          data_retrieval_time: `⏰ ${indianTime} IST`,
          search_status: "✅ Completed Successfully",
          data_source: "Official Government Databases"
        }
      },

      metadata: {
        api_version: "1.0",
        response_format: "JSON",
        data_types: ["Family Details", "Member Information", "Verification Status"],
        privacy_note: "No personal mobile data is displayed in the response"
      }
    };

    console.log(`📤 Sending response for mobile: ${number}`);
    return res.status(200).json(responseData);

  } catch (error) {
    console.error('💥 Unhandled Error:', error);
    return res.status(200).json({
      success: false,
      message: '❌ Service temporarily unavailable. Please try again later.',
      error_type: 'Internal Server Error',
      suggestion: 'Wait a few minutes and try again with the same mobile number'
    });
  }
}

// Helper function to extract district from address
function extractDistrict(address) {
  if (!address) return 'Not available';
  
  const districtMatch = address.match(/\b(DEHRADUN|TEHRI GARHWAL|HARIDWAR|UDHAM SINGH NAGAR|NAINITAL|ALMORA|PITHORAGARH|CHAMOLI|RUDRA PRAYAG|BAGESHWAR|CHAMPAWAT)\b/i);
  
  if (districtMatch) {
    const district = districtMatch[0];
    return district.charAt(0) + district.slice(1).toLowerCase();
  }
  
  return 'Not available';
}

// Helper function to extract pincode from address
function extractPincode(address) {
  if (!address) return 'Not available';
  const pincodeMatch = address.match(/\b\d{6}\b/);
  return pincodeMatch ? pincodeMatch[0] : 'Not available';
}

// Secure function to fetch mobile data
async function fetchMobileData(number) {
  try {
    const api1Key = 'DEMOKEY';
    const api1Base = 'https://allapiinone.vercel.app/';
    
    const mobileUrl = `${api1Base}?key=${api1Key}&type=mobile&term=${number}`;
    
    console.log(`📡 Calling Mobile API for: ${number}`);
    const response = await fetch(mobileUrl);
    
    if (!response.ok) {
      console.log(`❌ Mobile API HTTP Error: ${response.status}`);
      return { success: false, error: 'Service unavailable' };
    }

    const data = await response.json();
    console.log(`📱 Mobile API Response Status: ${data.success}`);

    if (!data.success || !data.result || data.result.length === 0) {
      return { success: false, error: 'No data found' };
    }

    return { 
      success: true, 
      users: data.result 
    };

  } catch (error) {
    console.log(`❌ Mobile API Exception: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Secure function to fetch family data
async function fetchFamilyData(users) {
  try {
    const api2Key = 'paidchx';
    const api2Base = 'https://adhar-family.vercel.app/';
    
    console.log(`👥 Processing ${users.length} user(s) for family data`);
    
    for (const user of users) {
      const aadhaarNumber = user.id_number;

      if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
        console.log(`❌ Invalid Aadhaar for user: ${user.name}`);
        continue;
      }

      const familyUrl = `${api2Base}fetch?key=${api2Key}&aadhaar=${aadhaarNumber}`;
      
      console.log(`🏠 Calling Family API for Aadhaar: ${aadhaarNumber}`);
      const response = await fetch(familyUrl);
      
      if (!response.ok) {
        console.log(`❌ Family API HTTP Error: ${response.status}`);
        continue;
      }

      const familyResponseData = await response.json();
      console.log(`🏠 Family API Response Code: ${familyResponseData.respCode || 'Success'}`);

      // Check if the response indicates "Ration card not found"
      if (familyResponseData.respCode === "214" || 
          familyResponseData.respMessage === "Ration card not found in IMPDS") {
        console.log(`❌ Ration card not found for Aadhaar: ${aadhaarNumber}`);
        continue;
      }

      if (!familyResponseData.memberDetailsList) {
        console.log(`❌ No member details in family response`);
        continue;
      }

      // Success - we found family data
      console.log(`✅ Found family data with ${familyResponseData.memberDetailsList.length} members`);
      return { 
        success: true, 
        data: familyResponseData 
      };
    }

    console.log(`❌ No family data found for any user`);
    return { success: false, error: 'No family data found' };

  } catch (error) {
    console.log(`❌ Family API Exception: ${error.message}`);
    return { success: false, error: error.message };
  }
}
