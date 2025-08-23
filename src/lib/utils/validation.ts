// 邮箱验证
export const validateEmail = (email: string): { isValid: boolean; message: string } => {
  if (!email) {
    return { isValid: false, message: '邮箱不能为空' }
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { isValid: false, message: '请输入有效的邮箱地址' }
  }
  
  return { isValid: true, message: '' }
}

// 密码验证
export const validatePassword = (password: string): { isValid: boolean; message: string } => {
  if (!password) {
    return { isValid: false, message: '密码不能为空' }
  }
  
  if (password.length < 8) {
    return { isValid: false, message: '密码至少需要8个字符' }
  }
  
  if (password.length > 50) {
    return { isValid: false, message: '密码不能超过50个字符' }
  }
  
  // 检查密码强度
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  
  if (!hasLetter || !hasNumber) {
    return { isValid: false, message: '密码必须包含字母和数字' }
  }
  
  return { isValid: true, message: '' }
}

// 姓名验证
export const validateName = (name: string): { isValid: boolean; message: string } => {
  if (!name) {
    return { isValid: false, message: '姓名不能为空' }
  }
  
  if (name.length < 2) {
    return { isValid: false, message: '姓名至少需要2个字符' }
  }
  
  if (name.length > 20) {
    return { isValid: false, message: '姓名不能超过20个字符' }
  }
  
  // 检查是否包含特殊字符
  const nameRegex = /^[\u4e00-\u9fa5a-zA-Z\s]+$/
  if (!nameRegex.test(name)) {
    return { isValid: false, message: '姓名只能包含中文、英文和空格' }
  }
  
  return { isValid: true, message: '' }
}

// 科目选择验证
export const validateSubjectSelection = (subjectIds: string[], minCount: number = 1): { isValid: boolean; message: string } => {
  if (subjectIds.length < minCount) {
    return { isValid: false, message: `请至少选择${minCount}个科目` }
  }
  
  if (subjectIds.length > 10) {
    return { isValid: false, message: '最多只能选择10个科目' }
  }
  
  return { isValid: true, message: '' }
}

// 数值范围验证
export const validateNumberRange = (value: number, min: number, max: number, fieldName: string): { isValid: boolean; message: string } => {
  if (value < min) {
    return { isValid: false, message: `${fieldName}不能少于${min}` }
  }
  
  if (value > max) {
    return { isValid: false, message: `${fieldName}不能超过${max}` }
  }
  
  return { isValid: true, message: '' }
}
